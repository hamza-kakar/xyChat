/**
 * Restore, first step: open a picked backup, validate
 * its manifest and database, and preview the chats it holds next to the
 * local chats they match. The worker keeps no state between the preview
 * and the restore; the caller sends the file again.
 */
import { err, ok, type Result } from '../core/result';
import { SCHEMA_VERSION } from '../storage/sqlite/migrations';
import { listBackupChats, openBackupDatabase } from '../storage/sqlite/backup-read';
import type { ScratchDatabase, ScratchDatabases } from '../storage/sqlite/scratch-db';
import type { SqliteDatabase } from '../storage/sqlite/db-wrapper';
import { openBackupArchive, type BackupArchive } from './backup-archive';
import type { RestoreError, RestoreMatch, RestorePreview } from './transfer-types';

/** An opened backup: its archive and its database. Close both. */
export interface OpenedBackup {
  readonly archive: BackupArchive;
  readonly db: ScratchDatabase;
}

/**
 * Opens a backup archive and its database snapshot.
 *
 * @param scratch Factory for the in-memory database.
 * @param file The picked backup zip.
 * @returns Both handles, or why the file can't be restored.
 */
export async function openBackup(
  scratch: ScratchDatabases,
  file: Blob,
): Promise<Result<OpenedBackup, RestoreError>> {
  const archive = await openBackupArchive(file);
  if (!archive.ok) {
    return archive;
  }
  if (archive.value.manifest.schemaVersion > SCHEMA_VERSION) {
    await archive.value.close();
    return err({ code: 'SCHEMA_TOO_NEW' });
  }
  let bytes: Uint8Array;
  try {
    bytes = await archive.value.readDatabase();
  } catch {
    await archive.value.close();
    return err({ code: 'CORRUPT_ARCHIVE' });
  }
  const db = openBackupDatabase(scratch, bytes);
  if (!db.ok) {
    await archive.value.close();
    return err({ code: db.error.code });
  }
  return ok({ archive: archive.value, db: db.value });
}

/** Closes an opened backup. */
export async function closeBackup(opened: OpenedBackup): Promise<void> {
  opened.db.close();
  await opened.archive.close();
}

/**
 * The local chats, for matching backup chats.
 *
 * @param db The app database.
 * @returns Local chat ids with their titles.
 */
export function listLocalChats(db: SqliteDatabase): readonly RestoreMatch[] {
  return db
    .selectArrays('SELECT id, title FROM chats ORDER BY id')
    .map((row) => ({ chatId: String(row[0]), title: typeof row[1] === 'string' ? row[1] : '' }));
}

/** Finds the local chat a backup chat matches: same id, else same title. */
function findMatch(
  locals: readonly RestoreMatch[],
  backupChatId: string,
  title: string,
): RestoreMatch | null {
  return (
    locals.find((local) => local.chatId === backupChatId) ??
    locals.find((local) => local.title === title) ??
    null
  );
}

/**
 * Previews a backup.
 *
 * @param deps The app database and the scratch factory.
 * @param file The picked backup zip.
 * @returns The backup's chats with their local matches, or a typed failure.
 */
export async function inspectBackup(
  deps: { readonly db: SqliteDatabase; readonly scratch: ScratchDatabases },
  file: Blob,
): Promise<Result<RestorePreview, RestoreError>> {
  const opened = await openBackup(deps.scratch, file);
  if (!opened.ok) {
    return opened;
  }
  try {
    const chats = listBackupChats(opened.value.db);
    if (!chats.ok) {
      return err({ code: chats.error.code });
    }
    const locals = listLocalChats(deps.db);
    const { manifest } = opened.value.archive;
    return ok({
      createdAt: manifest.createdAt,
      appVersion: manifest.appVersion,
      includesMedia: manifest.includesMedia,
      chats: chats.value.map((chat) => ({
        backupChatId: chat.id,
        title: chat.title,
        isGroup: chat.isGroup,
        messageCount: chat.messageCount,
        mediaCount: chat.mediaCount,
        firstTsKey: chat.firstTsKey,
        lastTsKey: chat.lastTsKey,
        match: findMatch(locals, chat.id, chat.title),
      })),
    });
  } finally {
    await closeBackup(opened.value);
  }
}
