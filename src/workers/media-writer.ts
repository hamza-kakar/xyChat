/**
 * Worker-only media writer: sync access handles are
 * available only in dedicated workers, so this module is imported by
 * import.worker. Main-thread reads live in storage/media-store.ts.
 * Failures return the shared Result type with a typed code union —
 * user-facing text is mapped from codes in i18n, and expected
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

/** A structured write failure (logger-only detail, never user-facing). */
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
 * Writes media bytes into OPFS via a sync access handle (worker-only).
 * Creates the chat directory as needed; closes the handle even when
 * write/flush fails — a leaked handle keeps the file locked for the session.
 *
 * @param path Canonical path from {@link mediaPathFor}.
 * @param bytes Media bytes to write.
 * @returns The written path and byte count, or a typed failure.
 */
/** A streaming writer over one OPFS file's sync access handle: entries
 * stream chunk by chunk, so the largest in-memory object is one
 * decompressed chunk. */
export interface MediaWriteSink {
  /** Appends one chunk at the tracked position. */
  write(chunk: Uint8Array): Promise<void>;
  /** Flushes and releases the handle; idempotent. */
  close(): Promise<void>;
}

/** Opens the streaming sink for one OPFS path. The handle closes
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
        const written = access.write(chunk, { at: position });
        position += written;
        if (written !== chunk.byteLength) {
          return Promise.reject(new Error('short write'));
        }
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

/** A positional writer over one OPFS file (decoded audio): the
 * payload streams in first and the header is patched in at the end. */
export interface RandomAccessSink {
  /** Writes bytes at a byte offset. */
  writeAt(bytes: Uint8Array, at: number): void;
  /** Flushes and releases the handle; idempotent. */
  close(): void;
}

/** Opens (creating or emptying) one OPFS file for positional writes. */
export async function openRandomAccessSink(
  path: string,
): Promise<Result<RandomAccessSink, MediaWriteError>> {
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
    access.truncate(0);
    let closed = false;
    return ok({
      writeAt: (bytes: Uint8Array, at: number) => {
        if (closed || access.write(bytes, { at }) !== bytes.byteLength) {
          throw new Error('short write');
        }
      },
      close: () => {
        if (!closed) {
          closed = true;
          access.flush();
          access.close();
        }
      },
    });
  } catch (error) {
    return err({ code: classify(error), detail: String(error).slice(0, 200) });
  }
}
