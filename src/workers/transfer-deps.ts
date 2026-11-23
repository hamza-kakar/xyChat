/**
 * Production wiring of the backup and restore runs (AGENTS.md §10.6):
 * OPFS through sync access handles and the storage estimate. Worker-only;
 * the runs themselves take these as injected dependencies (§18.4).
 */
import {
  BACKUP_TMP_DIR,
  deleteDirectory,
  deleteMediaFile,
  readMediaFile,
} from '../storage/media-store';
import type { SqliteChatRepository } from '../storage/sqlite/sqlite-repository';
import type { ScratchDatabases } from '../storage/sqlite/scratch-db';
import { openMediaWriteSink } from './media-writer';
import { productionArchiveReaderDeps } from './archive-reader';
import type { BackupRunDeps } from './backup-run';
import type { RestoreRunDeps } from './restore-run';

/** Removes every archive under `backup-tmp/`. */
export async function clearBackupFiles(): Promise<void> {
  await deleteDirectory(BACKUP_TMP_DIR);
}

/** Dependencies of a backup run. */
export function productionBackupDeps(
  repo: SqliteChatRepository,
  scratch: ScratchDatabases,
): BackupRunDeps {
  return {
    db: repo.database,
    scratch,
    openSink: openMediaWriteSink,
    readFile: readMediaFile,
    clearBackupFiles,
    deleteFile: deleteMediaFile,
    now: () => new Date(),
  };
}

/** Dependencies of a restore run. */
export function productionRestoreDeps(
  repo: SqliteChatRepository,
  scratch: ScratchDatabases,
): RestoreRunDeps {
  return {
    repo,
    scratch,
    openSink: openMediaWriteSink,
    deleteFile: deleteMediaFile,
    estimateFreeBytes: productionArchiveReaderDeps.estimateFreeBytes,
  };
}
