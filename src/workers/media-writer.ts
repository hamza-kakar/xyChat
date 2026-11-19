/**
 * Worker-only media writer (AGENTS.md §10.4): sync access handles are
 * available only in dedicated workers, so this module is imported by
 * import.worker (M3). Main-thread reads live in storage/media-store.ts.
 */

/** Result of a media write. */
export interface MediaWriteResult {
  readonly ok: true;
  readonly path: string;
  readonly bytes: number;
}

/** Write failure with a diagnostic reason (logger-only, §18.7). */
export interface MediaWriteError {
  readonly ok: false;
  readonly reason: string;
}

type MediaWrite = MediaWriteResult | MediaWriteError;

/**
 * Writes media bytes into OPFS via a sync access handle. Worker-only:
 * §10.4). Creates the chat directory as needed.
 *
 * @param path Canonical path from {@link mediaPathFor}.
 * @param bytes Media bytes to write.
 */
export async function writeMediaFile(path: string, bytes: Uint8Array): Promise<MediaWrite> {
  try {
    const root = await navigator.storage.getDirectory();
    const segments = path.split('/');
    const fileName = segments.pop();
    if (fileName === undefined || fileName === '') {
      return { ok: false as const, reason: 'empty file name' };
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
    return { ok: false as const, reason: String(error).slice(0, 200) };
  }
}
