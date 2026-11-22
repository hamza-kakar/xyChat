/**
 * Import admin queries (AGENTS.md §9.3, §10.5): mark transitions, written-
 * path bookkeeping, stored-fingerprint reads, orphan sweeps and raw
 * attachment reads. Split from sqlite-repository.ts for the §18.2 file-
 * size limit; all SQL lives here per §10.5.
 */
import * as v from 'valibot';
import type { Attachment } from '../repository';
import type { ChatId } from '../../core/ids';
import { attachmentFromRow } from './rows';
import type { SqliteDatabase } from './open';

function nowIso(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/u, 'Z');
}

/** Marks one import cancelled — applies only from in_progress (§9.3). */
export function markImportCancelled(db: SqliteDatabase, importId: string): void {
  db.run(
    "UPDATE imports SET status = 'cancelled', finished_at = ? WHERE id = ? AND status = 'in_progress'",
    [nowIso(), importId],
  );
}

/** Marks one import failed — applies only from in_progress (§9.3). */
export function markImportFailed(db: SqliteDatabase, importId: string): void {
  db.run(
    "UPDATE imports SET status = 'failed', finished_at = ? WHERE id = ? AND status = 'in_progress'",
    [nowIso(), importId],
  );
}

/** Replaces the recorded written-path list for one import (§9.3
 * bookkeeping; the list is cumulative, §9.2 step 8). */
export function recordWrittenPaths(
  db: SqliteDatabase,
  importId: string,
  paths: readonly string[],
): void {
  db.run('UPDATE imports SET written_paths_json = ? WHERE id = ?', [
    JSON.stringify(paths),
    importId,
  ]);
}

/** A row holding one fingerprint (§18.5: validated before use). */
const FingerprintRow = v.object({ fp: v.string() });

/** A row holding an attachment's file paths (§18.5). */
const PathRow = v.object({
  opfs_path: v.nullable(v.string()),
  thumb_path: v.nullable(v.string()),
});

/** Validates a row, throwing on a schema mismatch: a bad row means a
 * corrupt database, which the worker boundary reports (§18.7). */
function parseAdminRow<T extends v.GenericSchema>(
  schema: T,
  row: Record<string, unknown>,
): v.InferOutput<T> {
  const parsed = v.safeParse(schema, row);
  if (!parsed.success) {
    throw new Error('invalid admin row');
  }
  return parsed.output;
}

/** The non-empty file paths of validated path rows. */
function pathsOf(rows: readonly Record<string, unknown>[]): readonly string[] {
  const paths: string[] = [];
  for (const raw of rows) {
    const row = parseAdminRow(PathRow, raw);
    for (const path of [row.opfs_path, row.thumb_path]) {
      if (path !== null && path !== '') {
        paths.push(path);
      }
    }
  }
  return paths;
}

/** Fingerprints whose media the stored chat already holds (§9.2 step 8). */
export function listStoredFingerprints(db: SqliteDatabase, chatId: ChatId): readonly string[] {
  const rows = db.selectObjects(
    "SELECT m.fingerprint AS fp FROM messages m JOIN attachments a ON a.message_id = m.id WHERE m.chat_id = ? AND a.status = 'present'",
    [chatId],
  );
  return rows.map((row) => parseAdminRow(FingerprintRow, row).fp);
}

/** §9.3 orphan sweep, list half: OPFS media/thumbnail paths that no
 * attachment row references. The caller deletes after confirmation. */
export function listOrphanMedia(db: SqliteDatabase, fsPaths: readonly string[]): readonly string[] {
  const known = new Set(
    pathsOf(
      db.selectObjects(
        'SELECT opfs_path, thumb_path FROM attachments WHERE opfs_path IS NOT NULL OR thumb_path IS NOT NULL',
      ),
    ),
  );
  return fsPaths.filter((path) => !known.has(path));
}

/** Every stored file path of one chat (media and thumbnails), read before
 * the chat is deleted so its files can be removed afterwards (§10.4). */
export function listChatMediaPaths(db: SqliteDatabase, chatId: ChatId): readonly string[] {
  return pathsOf(
    db.selectObjects('SELECT opfs_path, thumb_path FROM attachments WHERE chat_id = ?', [chatId]),
  );
}

/** Raw attachment rows for one message (media viewer, §12.5). */
export function getAttachmentsForMessage(
  db: SqliteDatabase,
  messageId: number,
): readonly Attachment[] {
  const rows = db.selectObjects('SELECT * FROM attachments WHERE message_id = ? ORDER BY id', [
    messageId,
  ]);
  return rows.map(attachmentFromRow);
}
