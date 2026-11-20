/**
 * import.worker (AGENTS.md §3.2, §9.1): CPU- and IO-heavy import work off
 * the main thread. It never touches SQLite directly (§3.2) — the commit
 * goes through db.worker. Thin shell per the ratified ADR 0007 addendum:
 * phase logic lives in testable page modules; only the production IO
 * adapters (OPFS sync handles, OffscreenCanvas thumbnails) live here.
 */
import * as Comlink from 'comlink';
import { detectExport, type ImportError } from './import-detect';
import type { DetectAnswer, ImportWorkerApi } from './import-api';
import type { MediaPhaseDeps, ThumbnailResult } from './import-media';
import { listMediaEntries, readZipEntryBytes } from './archive-reader';
import { writeMediaFile } from './media-writer';
import { deleteMediaFile } from '../storage/media-store';
import { IMPORT_LIMITS } from '../core/limits';

/** Error detail is already structured; phase modules never throw expected
 * failures. Unexpected exceptions serialize to INTERNAL (§18.7). */
function toInternalError(error: unknown): ImportError {
  return { code: 'INTERNAL', detail: String(error).slice(0, 200) };
}

/** Production IO over the picked archive and worker-only OPFS handles
 * (§9.2 step 8, §10.4). Thin adapter — the logic lives in import-media.ts. */
/** Exported for the begin() wiring in the next commit (§9.2 step 8). */
export function mediaDeps(file: Blob): MediaPhaseDeps {
  return {
    listEntries: () => listMediaEntries(file),
    readEntry: (name) => readZipEntryBytes(file, name),
    writeFile: async (path, bytes) => {
      const result = await writeMediaFile(path, bytes);
      return result.ok
        ? { ok: true as const, value: { bytes: result.value.bytes } }
        : {
            ok: false as const,
            error: `${result.error.code}: ${result.error.detail}`,
          };
    },
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
    const jpeg = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.8 });
    return {
      data: new Uint8Array(await jpeg.arrayBuffer()),
      width: bitmap.width,
      height: bitmap.height,
    };
  } finally {
    bitmap.close();
  }
}

const api: ImportWorkerApi = {
  async detect(file, fileName, localeHint): Promise<DetectAnswer> {
    try {
      const options = localeHint === undefined ? {} : { localeHint };
      const result = await detectExport(fileName, file, options);
      return result.ok ? { ok: true, report: result.value } : { ok: false, error: result.error };
    } catch (error) {
      return { ok: false, error: toInternalError(error) };
    }
  },
};

// Expose the API. Comlink's expose returns void; the worker stays alive
// serving messages until terminated.
Comlink.expose(api, self);
