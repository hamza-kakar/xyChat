/**
 * FTS sync-trigger DDL: the single source of truth
 * for the messages_fts maintenance triggers. Migration 0001 creates them
 * with this constant, and the import commit's bulk-load path drops and
 * restores them through these helpers — keeping the DDL byte-identical in
 * both paths (no drift).
 */
import type { SqliteDatabase } from './db-wrapper';

/** The CREATE TRIGGER statements, exactly as migration 0001 applies them. */
export const FTS_TRIGGER_DDL = `
CREATE TRIGGER IF NOT EXISTS messages_fts_insert
AFTER INSERT ON messages BEGIN
  INSERT INTO messages_fts(rowid, body) VALUES (new.id, new.body);
END;

CREATE TRIGGER IF NOT EXISTS messages_fts_delete
AFTER DELETE ON messages BEGIN
  INSERT INTO messages_fts(messages_fts, rowid, body)
  VALUES ('delete', old.id, old.body);
END;

CREATE TRIGGER IF NOT EXISTS messages_fts_update
AFTER UPDATE OF body ON messages BEGIN
  INSERT INTO messages_fts(messages_fts, rowid, body)
  VALUES ('delete', old.id, old.body);
  INSERT INTO messages_fts(rowid, body) VALUES (new.id, new.body);
END;
`;

/** Trigger names dropped and restored by the bulk-load path (ADR 0012). */
const TRIGGER_NAMES = [
  'messages_fts_insert',
  'messages_fts_delete',
  'messages_fts_update',
] as const;

/** Drops the FTS sync triggers (bulk import fast path, ADR 0012). Must run
 * inside the same transaction as the bulk insert + rebuild. */
export function dropFtsTriggers(db: SqliteDatabase): void {
  for (const name of TRIGGER_NAMES) {
    db.exec(`DROP TRIGGER IF EXISTS ${name};`);
  }
}

/** Restores the FTS sync triggers and backfills the index for the rows the
 * bulk load just inserted (ADR 0012 — scoped to one import: a full 'rebuild'
 * would re-tokenize the whole chat). Must run inside the same transaction as
 * the bulk insert. */
export function restoreFtsTriggersAndBackfill(db: SqliteDatabase, importId: string): void {
  db.exec(FTS_TRIGGER_DDL);
  db.run(
    'INSERT INTO messages_fts(rowid, body) SELECT id, body FROM messages WHERE import_id = ?',
    [importId],
  );
}
