/**
 * Opened-archive handle (AGENTS.md §9.2 step 8): ONE
 * ZipReader shared by the whole media phase — the central directory is
 * never re-parsed per file, and entries STREAM chunk-by-chunk into a sink
 * so nothing is buffered whole (§9.4). Split from archive-reader.ts for
 * the §18.2 file-size limit.
 */
import * as zipJs from '@zip.js/zip.js';
import { err, ok, type Result } from '../core/result';
import { IMPORT_LIMITS } from '../core/limits';
import { isBombEntry, isOversizedEntry, isSafeEntryName, type ArchiveError } from './archive-gates';

/** Sink receiving one decompressed chunk (§9.2 step 8 streaming); returns
 * the running byte count. */
export type ChunkSink = (chunk: Uint8Array) => Promise<number> | number;

/**
 * An opened archive for the MEDIA phase: the central
 * directory is parsed ONCE; entries stream chunk-by-chunk into a sink —
 * no entry is ever buffered whole (§9.2 step 8, §9.4).
 */
export interface OpenedArchive {
  /** Safe non-text entries with their declared sizes. */
  listEntries(): Promise<
    Result<readonly { readonly name: string; readonly size: number }[], ArchiveError>
  >;
  /** Streams one entry's decompressed chunks into the sink. */
  streamEntry(
    name: string,
    sink: ChunkSink,
  ): Promise<Result<{ readonly bytes: number }, ArchiveError>>;
  /** Buffers one SMALL entry whole — thumbnail inputs only (images the
   * user's own device produced; the §15.2 2 GB cap still applies, and the
   * thumbnail pass needs decodable bytes anyway). */
  readEntry(name: string): Promise<Result<Uint8Array, ArchiveError>>;
  close(): Promise<void>;
}

/** zip.js Writer subclass forwarding every decompressed chunk into the
 * sink (§9.2 step 8: entries stream through the sync-access-handle writer
 * — the largest in-memory object is one decompressed chunk). */
class ChunkSinkWriter extends zipJs.Writer<void> {
  constructor(private readonly sink: ChunkSink) {
    super();
  }

  override writeUint8Array(array: Uint8Array): Promise<void> {
    return Promise.resolve(this.sink(array)).then(() => undefined);
  }
}

/** Leading bytes of every zip file (`PK\x03\x04`). */
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];

/** A `.txt` export carries no media: an archive with no entries. */
const NO_MEDIA: OpenedArchive = {
  listEntries: () => Promise.resolve(ok([])),
  streamEntry: () =>
    Promise.resolve(err({ code: 'ENTRY_NOT_FOUND', detail: 'text export has no media' })),
  readEntry: () =>
    Promise.resolve(err({ code: 'ENTRY_NOT_FOUND', detail: 'text export has no media' })),
  close: () => Promise.resolve(),
};

/** True when the blob starts with the zip magic bytes. */
async function startsWithZipMagic(file: Blob): Promise<boolean> {
  const head = new Uint8Array(await file.slice(0, ZIP_MAGIC.length).arrayBuffer());
  return head.length === ZIP_MAGIC.length && ZIP_MAGIC.every((byte, index) => head[index] === byte);
}

/**
 * Opens the archive for the media phase: ONE ZipReader, entries indexed by
 * name. A plain-text export (no zip magic) opens as an archive with no
 * media, so `.txt` imports run the same pipeline (§1.1, §9.2 step 1).
 *
 * @param file The picked export blob.
 */
export async function openArchive(file: Blob): Promise<Result<OpenedArchive, ArchiveError>> {
  try {
    if (!(await startsWithZipMagic(file))) {
      return ok(NO_MEDIA);
    }
    const reader = new zipJs.ZipReader(new zipJs.BlobReader(file));
    const entries = await reader.getEntries();
    if (entries.length > IMPORT_LIMITS.maxZipEntries) {
      await reader.close();
      return err({ code: 'TOO_MANY_ENTRIES', detail: `${entries.length} entries` });
    }
    const byName = new Map<string, zipJs.FileEntry>();
    const mediaSizes: { readonly name: string; readonly size: number }[] = [];
    for (const entry of entries) {
      if (entry.directory) {
        continue;
      }
      if (!isSafeEntryName(entry.filename) || isBombEntry(entry) || isOversizedEntry(entry)) {
        // The chat-text scan (readArchive) already rejected unsafe archives;
        // a media-phase handle only ever opens over a scanned file. Any
        // unsafe entry here is a defensive stop (§15.2).
        await reader.close();
        return err({ code: 'PATH_TRAVERSAL', detail: 'unsafe entry name' });
      }
      if (
        entry.filename.includes('__MACOSX') ||
        entry.filename.split('/').pop()?.startsWith('.') === true
      ) {
        continue;
      }
      if (entry.filename.toLowerCase().endsWith('.txt')) {
        continue;
      }
      byName.set(entry.filename, entry);
      mediaSizes.push({ name: entry.filename, size: entry.uncompressedSize });
    }
    return ok({
      listEntries: () => Promise.resolve(ok(mediaSizes)),
      streamEntry: async (name, sink) => {
        const entry = byName.get(name);
        if (entry === undefined) {
          return err({ code: 'ENTRY_NOT_FOUND', detail: 'entry absent from archive' });
        }
        const writer = new ChunkSinkWriter(sink);
        await entry.getData(writer);
        return ok({ bytes: writer.size });
      },
      readEntry: async (name) => {
        const entry = byName.get(name);
        if (entry === undefined) {
          return err({ code: 'ENTRY_NOT_FOUND', detail: 'entry absent from archive' });
        }
        return ok(await entry.getData(new zipJs.Uint8ArrayWriter()));
      },
      close: async () => {
        await reader.close();
      },
    });
  } catch (error) {
    return err({ code: 'CORRUPT_ARCHIVE', detail: errorNameOf(error) });
  }
}

function errorNameOf(error: unknown): string {
  return error instanceof Error ? error.name : 'unknown error';
}

/** Lists safe media entry names of an archive (detection phase, §12.8.4). */
export async function listMediaEntries(
  file: Blob,
): Promise<Result<readonly { readonly name: string; readonly size: number }[], ArchiveError>> {
  const opened = await openArchive(file);
  if (!opened.ok) {
    return opened;
  }
  const listed = await opened.value.listEntries();
  await opened.value.close();
  return listed;
}
