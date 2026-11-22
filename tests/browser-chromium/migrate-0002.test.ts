/**
 * Migration 0002 on a real database (AGENTS.md §10.3): a version-1
 * database with data migrates to version 2, gains the attachments-by-
 * message index, and keeps every row.
 */
import { describe, expect, it } from 'vitest';
import initSqlite3 from '@sqlite.org/sqlite-wasm';
import { wrapDatabase } from '../../src/storage/sqlite/open';
import { migrate } from '../../src/storage/sqlite/migrate';
import { SCHEMA_VERSION } from '../../src/storage/sqlite/migrations';
import { SQL_0001_INIT } from '../../src/storage/sqlite/migrations/0001-init';

describe('migration 0002: attachments by message', () => {
  it('migrates a version-1 database with data intact', async () => {
    const sqlite3 = await initSqlite3();
    const db = wrapDatabase(new sqlite3.oo1.DB({ filename: ':memory:', flags: 'c' }));
    db.exec('PRAGMA foreign_keys=ON;');
    db.exec(SQL_0001_INIT);
    db.run("INSERT INTO meta (key, value) VALUES ('schema_version', '1')");
    db.run(
      `INSERT INTO imports (id, file_name, file_bytes, status, parser_version, started_at)
       VALUES ('imp-1', 'chat.zip', 10, 'complete', '1.0.0', '2026-11-18T00:00:00Z')`,
    );
    db.run(
      `INSERT INTO chats (id, title, is_group, source_platform, date_order, created_at, updated_at)
       VALUES ('chat-1', 'Chat', 0, 'ios', 'DMY', '2026-11-18T00:00:00Z', '2026-11-18T00:00:00Z')`,
    );
    db.run(
      `INSERT INTO messages (id, chat_id, fingerprint, seq, ts_local, ts_key, kind, body, is_edited, import_id)
       VALUES (1, 'chat-1', 'fp-1', 0, '2026-11-17T21:19:00', 1794950340, 'media', '', 0, 'imp-1')`,
    );
    db.run(
      `INSERT INTO attachments (id, message_id, chat_id, file_name, media_type, status)
       VALUES ('att-1', 1, 'chat-1', 'a.jpg', 'image', 'missing')`,
    );

    migrate(db);

    expect(SCHEMA_VERSION).toBe(2);
    expect(db.selectObjects("SELECT value FROM meta WHERE key = 'schema_version'")).toEqual([
      { value: '2' },
    ]);
    expect(
      db.selectObjects(
        "SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_attachments_message'",
      ),
    ).toHaveLength(1);
    const plan = db
      .selectObjects('EXPLAIN QUERY PLAN SELECT * FROM attachments WHERE message_id = ?', [1])
      .map((row) => String(row['detail']));
    expect(plan.join(' ')).toContain('idx_attachments_message');
    expect(db.selectObjects('SELECT id, message_id FROM attachments')).toEqual([
      { id: 'att-1', message_id: 1 },
    ]);
    expect(db.selectObjects('SELECT COUNT(*) AS n FROM messages')).toEqual([{ n: 1 }]);
    db.close();
  });
});
