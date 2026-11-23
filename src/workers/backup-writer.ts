/**
 * Backup archive writer: streams the manifest, the
 * database snapshot and the media files into a zip in OPFS
 * (`backup-tmp/`) through a sync-access-handle sink, so a large backup is
 * never held in memory. Media is stored without recompression; it is
 * already compressed.
 */
import * as zipJs from '@zip.js/zip.js';
import { err, ok, type Result } from '../core/result';
import type { MediaWriteError, MediaWriteSink } from './media-writer';
import { DATABASE_ENTRY, MANIFEST_ENTRY, type BackupManifest } from './backup-manifest';
import type { TransferHooks } from './transfer-hooks';

/** Why writing the archive stopped. */
export type BackupWriteErrorCode = 'CANCELLED' | 'QUOTA' | 'IO';

/** A typed write failure (no content). */
export interface BackupWriteError {
  readonly code: BackupWriteErrorCode;
}

/** File access the writer needs (test seam). */
export interface BackupWriterDeps {
  /** Opens the archive's output file. */
  readonly openSink: (path: string) => Promise<Result<MediaWriteSink, MediaWriteError>>;
  /** Reads one stored media file; null when it is gone. */
  readonly readFile: (path: string) => Promise<Blob | null>;
}

/** What goes into the archive. */
export interface BackupZipInput {
  readonly path: string;
  readonly manifest: BackupManifest;
  readonly database: Uint8Array;
  /** Stored media and thumbnail paths; empty for a backup without media. */
  readonly mediaPaths: readonly string[];
  readonly hooks: TransferHooks;
}

/** Facts about a written archive. */
export interface BackupZipFacts {
  readonly bytes: number;
  readonly mediaFiles: number;
  /** Media files the database lists but OPFS no longer has. */
  readonly mediaMissing: number;
}

/** zip.js writer forwarding the archive's bytes into the OPFS sink. */
class SinkWriter extends zipJs.Writer<void> {
  written = 0;

  constructor(private readonly sink: MediaWriteSink) {
    super();
  }

  override async writeUint8Array(array: Uint8Array): Promise<void> {
    await this.sink.write(array);
    this.written += array.byteLength;
  }
}

/** Maps a thrown write failure onto the typed codes. */
function classify(error: unknown): BackupWriteErrorCode {
  return error instanceof Error && error.name === 'QuotaExceededError' ? 'QUOTA' : 'IO';
}

/** Adds the media files; stops early (returning null) when cancelled. */
async function addMedia(
  deps: BackupWriterDeps,
  zip: zipJs.ZipWriter<void>,
  input: BackupZipInput,
): Promise<{ readonly files: number; readonly missing: number } | null> {
  let files = 0;
  let missing = 0;
  const total = input.mediaPaths.length;
  for (const [index, path] of input.mediaPaths.entries()) {
    if (await input.hooks.isCancelled()) {
      return null;
    }
    const blob = await deps.readFile(path);
    if (blob === null) {
      missing += 1;
    } else {
      await zip.add(path, new zipJs.BlobReader(blob), { level: 0 });
      files += 1;
    }
    input.hooks.onProgress({ phase: 'media', current: index + 1, total });
  }
  return { files, missing };
}

/**
 * Writes the backup archive.
 *
 * @param deps OPFS access.
 * @param input Archive contents and the progress/cancel hooks.
 * @returns Facts about the archive, or why it stopped. The caller deletes
 *   a partial file after a failure.
 */
export async function writeBackupZip(
  deps: BackupWriterDeps,
  input: BackupZipInput,
): Promise<Result<BackupZipFacts, BackupWriteError>> {
  const opened = await deps.openSink(input.path);
  if (!opened.ok) {
    return err({ code: opened.error.code === 'QUOTA' ? 'QUOTA' : 'IO' });
  }
  const sink = opened.value;
  const writer = new SinkWriter(sink);
  const zip = new zipJs.ZipWriter(writer, { useWebWorkers: false });
  try {
    await zip.add(MANIFEST_ENTRY, new zipJs.TextReader(JSON.stringify(input.manifest)));
    await zip.add(DATABASE_ENTRY, new zipJs.Uint8ArrayReader(input.database));
    const media = await addMedia(deps, zip, input);
    if (media === null) {
      return err({ code: 'CANCELLED' });
    }
    input.hooks.onProgress({ phase: 'finishing', current: 0, total: 1 });
    await zip.close();
    return ok({ bytes: writer.written, mediaFiles: media.files, mediaMissing: media.missing });
  } catch (error) {
    return err({ code: classify(error) });
  } finally {
    await sink.close();
  }
}
