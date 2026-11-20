/**
 * import.worker (AGENTS.md §3.2, §9.1): CPU- and IO-heavy import work off
 * the main thread. It never touches SQLite directly (§3.2) — commit
 * requests go over the commit MessagePort to db.worker, the ONLY SQLite
 * owner. Thin shell per the ratified ADR 0007 addendum: the pipeline
 * orchestration lives in the gated page module import-begin.ts; only the
 * production IO adapters (opened archive, sync-handle sinks, thumbnail
 * scaling) and the commit-port storage live here.
 */
import * as Comlink from 'comlink';
import { detectExport, type ImportError } from './import-detect';
import type { BeginAnswer, DetectAnswer, ImportWorkerApi } from './import-api';
import { runPipeline } from './import-begin';
import type { MediaPhaseDeps, ThumbnailResult } from './import-media';
import { listMediaEntries, openArchive } from './archive-reader';
import { openMediaWriteSink } from './media-writer';
import { deleteMediaFile } from '../storage/media-store';
import { IMPORT_LIMITS } from '../core/limits';
import type { OpenedArchive } from './archive-reader';

/** Raw exception text can echo file names or values (§15.4) — the UI
 * carries the error class name only (§18.7). */
function toInternalError(error: unknown): ImportError {
  return { code: 'INTERNAL', detail: errorNameOf(error) };
}

function errorNameOf(error: unknown): string {
  return error instanceof Error ? error.name : 'unknown error';
}

/** Production IO over the picked archive and worker-only OPFS handles
 * (§9.2 step 8, §10.4): one opened archive per pipeline run, entries
 * streamed chunk-by-chunk into sync-handle sinks. Thin adapter — the logic
 * lives in import-media.ts. */
function mediaDeps(file: Blob, archive: OpenedArchive): MediaPhaseDeps {
  return {
    archive,
    listEntries: () => listMediaEntries(file),
    openWriteSink: async (path) => {
      const result = await openMediaWriteSink(path);
      return result.ok
        ? { ok: true as const, value: result.value }
        : { ok: false as const, error: `${result.error.code}: ${result.error.detail}` };
    },
    readEntryBuffered: (name) => archive.readEntry(name),
    deleteFile: (path) => deleteMediaFile(path),
    makeThumbnail: makeImageThumbnail,
    thumbnailTypes: DEFAULT_THUMBNAIL_TYPES,
  };
}

/** Media types thumbnailed during the import (§12.6). */
const DEFAULT_THUMBNAIL_TYPES: ReadonlySet<string> = new Set(['image', 'sticker']);

/** Generates a 320px-long-edge JPEG thumbnail via OffscreenCanvas (§9.2
 * step 9). Throws on undecodable input; the caller degrades to null. */
async function makeImageThumbnail(bytes: Uint8Array): Promise<ThumbnailResult | null> {
  const bitmap = await createImageBitmap(new Blob([bytes.buffer as ArrayBuffer]));
  try {
    const scale = Math.min(
      1,
      IMPORT_LIMITS.thumbnailLongEdge / Math.max(bitmap.width, bitmap.height),
    );
    const canvas = new OffscreenCanvas(
      Math.max(1, Math.round(bitmap.width * scale)),
      Math.max(1, Math.round(bitmap.height * scale)),
    );
    const context = canvas.getContext('2d');
    if (context === null) {
      return null;
    }
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const jpeg = await canvas.convertToBlob({
      type: 'image/jpeg',
      quality: IMPORT_LIMITS.thumbnailQuality,
    });
    return {
      data: new Uint8Array(await jpeg.arrayBuffer()),
      width: bitmap.width,
      height: bitmap.height,
    };
  } finally {
    bitmap.close();
  }
}

let commitPort: MessagePort | null = null;

const api: ImportWorkerApi = {
  setCommitPort(port: MessagePort): void {
    commitPort = port;
  },

  async detect(file, fileName, localeHint, dateOrderOverride): Promise<DetectAnswer> {
    try {
      const options =
        localeHint === undefined && dateOrderOverride === undefined
          ? {}
          : {
              ...(localeHint === undefined ? {} : { localeHint }),
              ...(dateOrderOverride === undefined ? {} : { dateOrderOverride }),
            };
      const result = await detectExport(fileName, file, options);
      return result.ok ? { ok: true, report: result.value } : { ok: false, error: result.error };
    } catch (error) {
      return { ok: false, error: toInternalError(error) };
    }
  },

  async begin(options, hooks): Promise<BeginAnswer> {
    if (commitPort === null) {
      return { ok: false, error: { code: 'INTERNAL', detail: 'commit port not set' } };
    }
    const port = commitPort;
    // The archive opens ONCE for the whole media phase (review Major 9);
    // the pipeline module closes it when the run settles.
    const opened = await openArchive(options.file);
    if (!opened.ok) {
      return { ok: false, error: opened.error };
    }
    try {
      return await runPipeline({
        file: options.file,
        fileName: options.fileName,
        confirmed: options.confirmed,
        importId: options.importId,
        commitPort: port,
        hooks,
        mediaIO: mediaDeps(options.file, opened.value),
        hashBytes: hashViaSubtle,
      });
    } finally {
      await opened.value.close();
    }
  },
};

/** Real SHA-256 for §8.10 fingerprints (workers: crypto.subtle). */
const hashViaSubtle = async (bytes: Uint8Array): Promise<Uint8Array> => {
  const digest = await crypto.subtle.digest('SHA-256', bytes.buffer as ArrayBuffer);
  return new Uint8Array(digest);
};

// Expose the API. Comlink's expose returns void; the worker stays alive
// serving messages until terminated.
Comlink.expose(api, self);
