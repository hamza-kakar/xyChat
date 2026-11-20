/**
 * Worker-only media writer (AGENTS.md §10.4): sync access handles are
 * available only in dedicated workers, so this module is imported by
 * import.worker (M3). Main-thread reads live in storage/media-store.ts.
 * Failures return the shared Result type (§6.1) with a typed code union —
 * user-facing text is mapped from codes in i18n (§18.7), and expected
 * failures never throw.
 */
import { err, ok, type Result } from '../core/result';

/** Successful write: the canonical path written and the byte count. */
export interface MediaWriteOk {
  readonly path: string;
  readonly bytes: number;
}

/** Failure codes for a media write. */
export type MediaWriteErrorCode = 'EMPTY_NAME' | 'QUOTA' | 'IO';

/** A structured write failure (§18.7: logger-only detail, never user-facing). */
export interface MediaWriteError {
  readonly code: MediaWriteErrorCode;
  /** Engine-provided diagnostic text; contains no user content. */
  readonly detail: string;
}

type MediaWrite = Result<MediaWriteOk, MediaWriteError>;

/** Maps an unexpected write error onto the typed failure codes. */
function classify(error: unknown): MediaWriteErrorCode {
  return error instanceof Error && error.name === 'QuotaExceededError' ? 'QUOTA' : 'IO';
}

/**
 * Writes media bytes into OPFS via a sync access handle (worker-only, §10.4).
 * Creates the chat directory as needed; closes the handle even when
 * write/flush fails — a leaked handle keeps the file locked for the session.
 *
 * @param path Canonical path from {@link mediaPathFor}.
 * @param bytes Media bytes to write.
 * @returns The written path and byte count, or a typed failure.
 */
export async function writeMediaFile(path: string, bytes: Uint8Array): Promise<MediaWrite> {
  try {
    const root = await navigator.storage.getDirectory();
    const segments = path.split('/');
    const fileName = segments.pop();
    if (fileName === undefined || fileName === '') {
      return err({ code: 'EMPTY_NAME', detail: path });
    }
    let dir = root;
    for (const segment of segments) {
      dir = await dir.getDirectoryHandle(segment, { create: true });
    }
    const fileHandle = await dir.getFileHandle(fileName, { create: true });
    const access = await fileHandle.createSyncAccessHandle();
    try {
      access.write(bytes);
      access.flush();
    } finally {
      access.close();
    }
    return ok({ path, bytes: bytes.byteLength });
  } catch (error) {
    return err({ code: classify(error), detail: String(error).slice(0, 200) });
  }
}
