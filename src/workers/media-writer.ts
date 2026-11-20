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
/** A streaming writer over one OPFS file's sync access handle (review
 * Major 9: entries stream chunk-by-chunk — the largest in-memory object is
 * one decompressed chunk, §9.2 step 8). */
export interface MediaWriteSink {
  /** Appends one chunk at the tracked position. */
  write(chunk: Uint8Array): Promise<void>;
  /** Flushes and releases the handle; idempotent. */
  close(): Promise<void>;
}

/** Opens the streaming sink for one OPFS path (§10.4). The handle closes
 * even when a write fails — a leaked handle locks the file. */
export async function openMediaWriteSink(
  path: string,
): Promise<Result<MediaWriteSink, MediaWriteError>> {
  try {
    const root = await navigator.storage.getDirectory();
    const segments = path.split('/');
    const fileName = segments.pop();
    if (fileName === undefined || fileName === '') {
      return err({ code: 'EMPTY_NAME' as const, detail: path });
    }
    let dir = root;
    for (const segment of segments) {
      dir = await dir.getDirectoryHandle(segment, { create: true });
    }
    const fileHandle = await dir.getFileHandle(fileName, { create: true });
    const access = await fileHandle.createSyncAccessHandle();
    let position = 0;
    let closed = false;
    const close = (): Promise<void> => {
      if (!closed) {
        closed = true;
        access.close();
      }
      return Promise.resolve();
    };
    return ok({
      write: (chunk: Uint8Array) => {
        if (closed) {
          return Promise.reject(new Error('sink closed'));
        }
        access.write(chunk, { at: position });
        position += chunk.byteLength;
        return Promise.resolve();
      },
      close,
    });
  } catch (error) {
    return err({ code: classify(error), detail: String(error).slice(0, 200) });
  }
}

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
