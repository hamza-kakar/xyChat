/**
 * Reading a backup archive for restore. The zip
 * is user-picked and untrusted: every entry passes the same name, size and
 * compression-ratio gates as an export, the manifest is validated, and media entries stream into OPFS chunk by chunk.
 */
import * as zipJs from '@zip.js/zip.js';
import { err, ok, type Result } from '../core/result';
import { BACKUP_LIMITS, IMPORT_LIMITS } from '../core/limits';
import { isBombEntry, isOversizedEntry, isSafeEntryName } from './archive-gates';
import { ChunkSinkWriter, type ChunkSink } from './opened-archive';
import {
  DATABASE_ENTRY,
  MANIFEST_ENTRY,
  parseManifest,
  type BackupManifest,
} from './backup-manifest';

/** Why a backup archive can't be restored. */
export type BackupArchiveErrorCode =
  'NOT_A_BACKUP' | 'INVALID_MANIFEST' | 'UNSAFE_ARCHIVE' | 'DATABASE_TOO_LARGE' | 'CORRUPT_ARCHIVE';

/** A typed archive failure (counts only). */
export interface BackupArchiveError {
  readonly code: BackupArchiveErrorCode;
}

/** An opened backup archive. */
export interface BackupArchive {
  readonly manifest: BackupManifest;
  /** Reads the database snapshot whole (it is size-capped). */
  readDatabase(): Promise<Uint8Array>;
  /** True when the archive holds this media entry. */
  hasEntry(name: string): boolean;
  /** Streams one entry into the sink; false when it is absent. */
  streamEntry(name: string, sink: ChunkSink): Promise<boolean>;
  close(): Promise<void>;
}

/** Leading bytes of every zip file (`PK\x03\x04`). */
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];

/** True when the blob starts with the zip magic bytes. */
async function startsWithZipMagic(file: Blob): Promise<boolean> {
  const head = new Uint8Array(await file.slice(0, ZIP_MAGIC.length).arrayBuffer());
  return head.length === ZIP_MAGIC.length && ZIP_MAGIC.every((byte, index) => head[index] === byte);
}

/** Indexes the archive's file entries, rejecting unsafe ones. */
function indexEntries(
  entries: readonly zipJs.Entry[],
): Result<Map<string, zipJs.FileEntry>, BackupArchiveError> {
  if (entries.length > IMPORT_LIMITS.maxZipEntries) {
    return err({ code: 'UNSAFE_ARCHIVE' });
  }
  const byName = new Map<string, zipJs.FileEntry>();
  let total = 0;
  for (const entry of entries) {
    if (entry.directory) {
      continue;
    }
    if (!isSafeEntryName(entry.filename) || isBombEntry(entry) || isOversizedEntry(entry)) {
      return err({ code: 'UNSAFE_ARCHIVE' });
    }
    total += entry.uncompressedSize;
    if (total > IMPORT_LIMITS.maxUncompressedTotalBytes) {
      return err({ code: 'UNSAFE_ARCHIVE' });
    }
    byName.set(entry.filename, entry);
  }
  return ok(byName);
}

/** Reads and validates the manifest entry. */
async function readManifest(
  byName: ReadonlyMap<string, zipJs.FileEntry>,
): Promise<Result<BackupManifest, BackupArchiveError>> {
  const entry = byName.get(MANIFEST_ENTRY);
  const database = byName.get(DATABASE_ENTRY);
  if (entry === undefined || database === undefined) {
    return err({ code: 'NOT_A_BACKUP' });
  }
  if (entry.uncompressedSize > BACKUP_LIMITS.maxManifestBytes) {
    return err({ code: 'INVALID_MANIFEST' });
  }
  if (database.uncompressedSize > BACKUP_LIMITS.maxDatabaseBytes) {
    return err({ code: 'DATABASE_TOO_LARGE' });
  }
  const manifest = parseManifest(await entry.getData(new zipJs.TextWriter()));
  return manifest === null ? err({ code: 'INVALID_MANIFEST' }) : ok(manifest);
}

/**
 * Opens a backup archive.
 *
 * @param file The picked backup zip.
 * @returns The opened archive (the caller closes it), or why it is not a
 *   usable backup.
 */
export async function openBackupArchive(
  file: Blob,
): Promise<Result<BackupArchive, BackupArchiveError>> {
  if (!(await startsWithZipMagic(file))) {
    return err({ code: 'NOT_A_BACKUP' });
  }
  const reader = new zipJs.ZipReader(new zipJs.BlobReader(file), { useWebWorkers: false });
  try {
    const indexed = indexEntries(await reader.getEntries());
    if (!indexed.ok) {
      await reader.close();
      return indexed;
    }
    const byName = indexed.value;
    const manifest = await readManifest(byName);
    if (!manifest.ok) {
      await reader.close();
      return manifest;
    }
    return ok({
      manifest: manifest.value,
      readDatabase: async () => {
        const entry = byName.get(DATABASE_ENTRY);
        return entry === undefined ? new Uint8Array() : entry.getData(new zipJs.Uint8ArrayWriter());
      },
      hasEntry: (name) => byName.has(name),
      streamEntry: async (name, sink) => {
        const entry = byName.get(name);
        if (entry === undefined) {
          return false;
        }
        await entry.getData(new ChunkSinkWriter(sink));
        return true;
      },
      close: () => reader.close(),
    });
  } catch {
    await reader.close();
    return err({ code: 'CORRUPT_ARCHIVE' });
  }
}
