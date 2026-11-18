/**
 * OPFS media store (AGENTS.md §10.4): media and thumbnails live under
 * `media/<chatId>/` and `thumbs/<chatId>/`. Writes use sync access handles
 * in workers (iOS-supported); reads on the main thread use async handles.
 */
import type { ChatId } from '../core/ids';

/** OPFS root segment names (§10.4). */
export const MEDIA_DIR = 'media';
export const THUMBS_DIR = 'thumbs';
/** Import crash-rollback staging dir (§9.3). */
export const BACKUP_TMP_DIR = 'backup-tmp';

/** Result of a media write. */
export type MediaWriteResult =
  | { readonly ok: true; readonly path: string; readonly bytes: number }
  | { readonly ok: false; readonly reason: string };

/**
 * Builds the canonical OPFS path for an attachment (§10.4: stored by
 * attachment id, never the original name).
 *
 * @param chatId Owning chat.
 * @param attachmentId Attachment id (UUID).
 * @param extension Lowercase extension without the dot.
 * @example
 * mediaPathFor(chatId, 'a1b2c3', 'jpg'); // 'media/<chatId>/a1b2c3.jpg'
 */
export function mediaPathFor(chatId: ChatId, attachmentId: string, extension: string): string {
  return `${MEDIA_DIR}/${chatId}/${attachmentId}.${extension}`;
}

/** Builds the thumbnail path for an attachment. */
export function thumbPathFor(chatId: ChatId, attachmentId: string): string {
  return `${THUMBS_DIR}/${chatId}/${attachmentId}.jpg`;
}

/**
 * Writes media bytes into OPFS via a sync access handle (worker context,
 * §10.4). Creates the chat directory as needed.
 *
 * @param path Canonical path from {@link mediaPathFor}.
 * @param bytes Media bytes to write.
 */
export async function writeMediaFile(path: string, bytes: Uint8Array): Promise<MediaWriteResult> {
  try {
    const root = await navigator.storage.getDirectory();
    const segments = path.split('/');
    const fileName = segments.pop();
    if (fileName === undefined || fileName === '') {
      return { ok: false, reason: 'empty file name' };
    }
    let dir = root;
    for (const segment of segments) {
      dir = await dir.getDirectoryHandle(segment, { create: true });
    }
    const fileHandle = await dir.getFileHandle(fileName, { create: true });
    const access = await fileHandle.createSyncAccessHandle();
    access.write(bytes);
    access.flush();
    access.close();
    return { ok: true, path, bytes: bytes.byteLength };
  } catch (error) {
    return { ok: false, reason: String(error).slice(0, 200) };
  }
}

/**
 * Reads a media file as a Blob (main thread, async API §10.4).
 *
 * @returns null when the file does not exist.
 */
export async function readMediaFile(path: string): Promise<Blob | null> {
  try {
    const root = await navigator.storage.getDirectory();
    const segments = path.split('/');
    const fileName = segments.pop();
    if (fileName === undefined || fileName === '') {
      return null;
    }
    let dir = root;
    for (const segment of segments) {
      dir = await dir.getDirectoryHandle(segment);
    }
    const fileHandle = await dir.getFileHandle(fileName);
    return await fileHandle.getFile();
  } catch {
    return null;
  }
}

/**
 * Recursively collects every file path under a directory prefix (§9.3
 * orphan sweeping, §10.4 delete chat).
 */
export async function listFilesUnder(prefix: string): Promise<readonly string[]> {
  const paths: string[] = [];
  const walk = async (dir: FileSystemDirectoryHandle, pathSoFar: string): Promise<void> => {
    for await (const [name, handle] of dir.entries()) {
      const childPath = `${pathSoFar}/${name}`;
      if (handle.kind === 'file') {
        if (childPath.startsWith(prefix)) {
          paths.push(childPath);
        }
      } else if (handle instanceof FileSystemDirectoryHandle) {
        await walk(handle, childPath);
      }
    }
  };
  const root = await navigator.storage.getDirectory();
  await walk(root, '');
  return paths;
}

/**
 * Deletes one media file.
 *
 * @returns true when deleted, false when absent or failed.
 */
export async function deleteMediaFile(path: string): Promise<boolean> {
  try {
    const root = await navigator.storage.getDirectory();
    const segments = path.split('/');
    const fileName = segments.pop();
    if (fileName === undefined || fileName === '') {
      return false;
    }
    let dir = root;
    for (const segment of segments) {
      dir = await dir.getDirectoryHandle(segment);
    }
    await dir.removeEntry(fileName);
    return true;
  } catch {
    return false;
  }
}

/**
 * Deletes every media/thumbnail file for one chat (§10.4: after the DB
 * commit; failures are caught later by the orphan sweeper §9.3).
 *
 * @returns Count of files actually removed.
 */
export async function deleteChatMedia(chatId: ChatId): Promise<number> {
  const removed = await deleteDirRecursive(`${MEDIA_DIR}/${chatId}`);
  const removedThumbs = await deleteDirRecursive(`${THUMBS_DIR}/${chatId}`);
  return removed + removedThumbs;
}

/** Recursively removes a directory and its contents. */
async function deleteDirRecursive(path: string): Promise<number> {
  let count = 0;
  try {
    const root = await navigator.storage.getDirectory();
    const segments = path.split('/');
    const name = segments.pop();
    if (name === undefined || name === '') {
      return 0;
    }
    let dir = root;
    for (const segment of segments) {
      dir = await dir.getDirectoryHandle(segment);
    }
    count = await countFiles(dir);
    await dir.removeEntry(name, { recursive: true });
  } catch {
    // Absent directory: nothing to remove.
  }
  return count;
}

/** Counts files under a directory handle (recursive). */
async function countFiles(dir: FileSystemDirectoryHandle): Promise<number> {
  let count = 0;
  for await (const [, handle] of dir.entries()) {
    if (handle.kind === 'file') {
      count += 1;
    } else if (handle instanceof FileSystemDirectoryHandle) {
      count += await countFiles(handle);
    }
  }
  return count;
}
