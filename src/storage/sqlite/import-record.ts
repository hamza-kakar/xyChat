/**
 * The in_progress import row: created BEFORE media writes
 * so boot rollback can find and clean up after a crash.
 */
import type { SqliteDatabase } from './open';

/** Inputs for creating the in_progress import row. */
export interface ImportRecordInput {
  readonly importId: string;
  readonly fileName: string;
  readonly fileBytes: number;
  readonly parserVersion: string;
}

/** Creates the in_progress import row — call BEFORE media writes. */
export function createImportRecord(db: SqliteDatabase, input: ImportRecordInput): void {
  const now = new Date().toISOString().replace(/\.\d{3}Z$/u, 'Z');
  db.run(
    `INSERT INTO imports (id, chat_id, file_name, file_bytes, status, parser_version, started_at)
     VALUES (?, NULL, ?, ?, 'in_progress', ?, ?)`,
    [input.importId, input.fileName, input.fileBytes, input.parserVersion, now],
  );
}
