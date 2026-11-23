/**
 * Making a backup (AGENTS.md §10.6), run inside db.worker: snapshot the
 * chosen chats, then stream the archive into `backup-tmp/`. The main
 * thread reads the finished file from OPFS to share or download it.
 */
import { err, ok, type Result } from '../core/result';
import { buildBackupSnapshot } from '../storage/sqlite/backup-snapshot';
import type { SqliteDatabase } from '../storage/sqlite/db-wrapper';
import type { ScratchDatabases } from '../storage/sqlite/scratch-db';
import { BACKUP_TMP_DIR } from '../storage/media-store';
import { backupFileName, buildManifest } from './backup-manifest';
import { writeBackupZip, type BackupWriterDeps } from './backup-writer';
import type { TransferHooks } from './transfer-hooks';
import type { BackupError, BackupRequest, BackupResult } from './transfer-types';

/** Everything a backup run touches (§18.4 test seam). */
export interface BackupRunDeps extends BackupWriterDeps {
  readonly db: SqliteDatabase;
  readonly scratch: ScratchDatabases;
  /** Removes earlier archives from `backup-tmp/`. */
  readonly clearBackupFiles: () => Promise<void>;
  readonly deleteFile: (path: string) => Promise<boolean>;
  readonly now: () => Date;
}

/**
 * Makes a backup archive.
 *
 * @param deps Database, OPFS access and clock.
 * @param request What to include.
 * @param hooks Progress and cancellation.
 * @returns The archive's path and facts, or why it was not made.
 */
export async function runBackup(
  deps: BackupRunDeps,
  request: BackupRequest,
  hooks: TransferHooks,
): Promise<Result<BackupResult, BackupError>> {
  await deps.clearBackupFiles();
  hooks.onProgress({ phase: 'snapshot', current: 0, total: 1 });
  const snapshot = buildBackupSnapshot(deps.db, deps.scratch, request.chatIds);
  if (snapshot.chats.length === 0) {
    return err({ code: 'NO_CHATS' });
  }
  const createdAt = deps.now();
  const fileName = backupFileName(request.appName, createdAt);
  const path = `${BACKUP_TMP_DIR}/${fileName}`;
  const written = await writeBackupZip(deps, {
    path,
    manifest: buildManifest({
      app: request.appName,
      appVersion: request.appVersion,
      schemaVersion: snapshot.schemaVersion,
      createdAt,
      chats: snapshot.chats,
      includesMedia: request.includeMedia,
    }),
    database: snapshot.bytes,
    mediaPaths: request.includeMedia ? snapshot.mediaPaths : [],
    hooks,
  });
  if (!written.ok) {
    await deps.deleteFile(path);
    return written;
  }
  return ok({
    path,
    fileName,
    bytes: written.value.bytes,
    chatCount: snapshot.chats.length,
    mediaFiles: written.value.mediaFiles,
    mediaMissing: written.value.mediaMissing,
  });
}
