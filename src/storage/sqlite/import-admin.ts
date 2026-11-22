/**
 * Import admin queries (AGENTS.md §9.3, §10.5): mark transitions, written-
 * path bookkeeping, stored-fingerprint reads, orphan sweeps and raw
 * attachment reads. Split from sqlite-repository.ts for the §18.2 file-
 * size limit; all SQL lives here per §10.5.
 */
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

/** Fingerprints whose media the stored chat already holds (§9.2 step 8). */
export function listStoredFingerprints(db: SqliteDatabase, chatId: ChatId): readonly string[] {
  const rows = db.selectObjects(
    "SELECT m.fingerprint AS fp FROM messages m JOIN attachments a ON a.message_id = m.id WHERE m.chat_id = ? AND a.status = 'present'",
    [chatId],
  );
  return rows.map((row) => String(row['fp']));
}

/** §9.3 orphan sweep, list half: OPFS media/thumbnail paths that no
 * attachment row references. The caller deletes after confirmation. */
export function listOrphanMedia(db: SqliteDatabase, fsPaths: readonly string[]): readonly string[] {
  const rows = db.selectObjects(
    'SELECT opfs_path, thumb_path FROM attachments WHERE opfs_path IS NOT NULL OR thumb_path IS NOT NULL',
  );
  const known = new Set<string>();
  for (const row of rows) {
    for (const column of ['opfs_path', 'thumb_path']) {
      const value = row[column];
      if (typeof value === 'string' && value !== '') {
        known.add(value);
      }
    }
  }
  return fsPaths.filter((path) => !known.has(path));
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
