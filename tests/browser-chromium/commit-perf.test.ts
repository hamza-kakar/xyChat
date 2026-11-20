/**
 * Import-commit performance test (AGENTS.md §17): committing a 100k-message
 * re-import into a chat that already stores 100k messages must complete in
 * ≤ 2 s on CI Chromium — the full planMerge walk, stored-row re-sequencing
 * (+1e9 offset trick, §10.2) and aggregate recompute, on the real
 * sqlite-wasm stack. Chromium-only per ADR 0007.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import initSqlite3 from '@sqlite.org/sqlite-wasm';
import { wrapDatabase, verifyFts5Trigram } from '../../src/storage/sqlite/open';
import { migrate } from '../../src/storage/sqlite/migrate';
import { commitImport, type ImportCommitInput } from '../../src/storage/sqlite/import-commit';
import type { ParsedMessage } from '../../src/core/model';
import type { ChatId } from '../../src/core/ids';

const ROWS = 100_000;
const BUDGET_MS = 2_000;

const BODIES: readonly string[] = [
  'plain text message body for the perf test',
  'a searchable needle hiding in row N',
  'common filler text without anything special',
];

let db: Awaited<ReturnType<typeof openDb>>;
let chatId: ChatId;

async function openDb() {
  const sqlite3 = await initSqlite3();
  // No 't' flag: tracing would print every statement through the browser
  // bridge and dominate the wall clock.
  const dbRaw = new sqlite3.oo1.DB({ filename: ':memory:', flags: 'c' });
  const db = wrapDatabase(dbRaw);
  db.exec('PRAGMA foreign_keys=ON; PRAGMA temp_store=MEMORY;');
  migrate(db);
  verifyFts5Trigram(db);
  return db;
}

/** Stored message N, identical to the incoming twin built by twinAt(). */
function storedRow(j: number): {
  fingerprint: string;
  body: string;
  tsLocal: string;
  tsKey: number;
} {
  const body = BODIES[j % BODIES.length] ?? '';
  const hour = 8 + (j % 12);
  const minute = j % 60;
  const tsLocal = `2026-11-17T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;
  return {
    fingerprint: `perf-fp-${j}`,
    body,
    tsLocal,
    tsKey: Date.UTC(2026, 10, 17, hour, minute, 0) / 1000,
  };
}

/** The incoming twin of stored row j — same timestamp so planMerge rule 1
 * (§8.10) aligns every pair at the heads. */
function twinAt(j: number): ParsedMessage {
  const row = storedRow(j);
  return {
    seq: j,
    sourceLine: j + 1,
    timestamp: { year: 2026, month: 11, day: 17, hour: 8 + (j % 12), minute: j % 60, second: 0 },
    author: 'Sara',
    kind: 'text',
    body: row.body,
    isEdited: false,
    attachment: null,
    poll: null,
    location: null,
  };
}

beforeEach(async () => {
  db = await openDb();
  chatId = 'perf-chat' as ChatId;
  db.run(
    `INSERT INTO imports (id, file_name, file_bytes, status, parser_version, started_at)
     VALUES ('perf-commit-1', 'perf.txt', 0, 'complete', '1.0.0', '2026-11-18T00:00:00Z')`,
  );
  db.run(
    `INSERT INTO chats (id, title, is_group, source_platform, date_order, message_count, created_at, updated_at)
     VALUES (?, 'Perf Chat', 0, 'android', 'DMY', 0, '2026-11-18T00:00:00Z', '2026-11-18T00:00:00Z')`,
    [chatId],
  );
  // Seed the stored chat: 100k messages in 500-row batched inserts.
  for (let i = 0; i < ROWS; i += 500) {
    const values: string[] = [];
    const params: (string | number | null)[] = [];
    for (let j = i; j < Math.min(i + 500, ROWS); j += 1) {
      const row = storedRow(j);
      values.push(`(NULL, ?, ?, ?, ?, ?, NULL, 'text', ?, 0, NULL, 'perf-commit-1')`);
      params.push(chatId, row.fingerprint, j, row.tsLocal, row.tsKey, row.body);
    }
    db.run(
      `INSERT INTO messages (id, chat_id, fingerprint, seq, ts_local, ts_key, author_id, kind, body, is_edited, extra_json, import_id)
       VALUES ${values.join(', ')}`,
      params,
    );
  }
  db.run(
    `INSERT INTO imports (id, file_name, file_bytes, status, parser_version, started_at)
     VALUES ('perf-commit-2', 'perf2.txt', 0, 'in_progress', '1.0.0', '2026-11-18T00:01:00Z')`,
  );
});

describe('import-commit performance (§17, ADR 0007)', () => {
  it('commits a 100k re-import into a 100k-message chat within budget', () => {
    const input: ImportCommitInput = {
      importId: 'perf-commit-2',
      targetChatId: chatId,
      newChat: {
        title: 'ignored for merges',
        isGroup: false,
        sourcePlatform: 'android',
        dateOrder: 'DMY',
      },
      messages: Array.from({ length: ROWS }, (_, j) => ({
        fingerprint: `perf-fp-${j}`,
        message: twinAt(j),
      })),
      attachments: [],
      fileName: 'perf2.txt',
      fileBytes: 10_000_000,
      parserVersion: '1.0.0',
    };
    const start = performance.now();
    const result = commitImport(db, input);
    const elapsed = performance.now() - start;

    expect(result.messagesInserted).toBe(0);
    expect(result.duplicatesSkipped).toBe(ROWS);
    expect(result.mediaUpgraded).toBe(0);
    // seq renumbered 0..n-1 with no gaps after the merge (§8.10).
    const gaps = db.selectObjects(
      `SELECT COUNT(*) AS n FROM (SELECT seq, LAG(seq) OVER (ORDER BY seq) AS prev FROM messages WHERE chat_id = ?)
       WHERE prev IS NOT NULL AND seq != prev + 1`,
      [chatId],
    )[0]?.['n'];
    expect(gaps).toBe(0);
    const aggregates = db.selectObjects('SELECT message_count FROM chats WHERE id = ?', [chatId]);
    expect(aggregates[0]?.['message_count']).toBe(ROWS);
    expect(
      elapsed,
      `commit ${ROWS}+${ROWS} took ${elapsed.toFixed(0)}ms (budget ${BUDGET_MS}ms)`,
    ).toBeLessThan(BUDGET_MS);
  });
});
