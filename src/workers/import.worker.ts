/**
 * import.worker (AGENTS.md §3.2, §9.1): CPU- and IO-heavy import work off
 * the main thread. It never touches SQLite directly (§3.2) — commit
 * requests and written-path batches go over the commit MessagePort to
 * db.worker, the ONLY SQLite owner. Thin shell per the ratified ADR 0007
 * addendum: phase logic lives in testable page modules (import-detect,
 * import-run, import-media); the production IO adapters and the port
 * protocol are the only worker-specific code here.
 */
import * as Comlink from 'comlink';
import { detectExport, type ImportError } from './import-detect';
import type { BeginAnswer, BeginOptions, DetectAnswer, ImportWorkerApi } from './import-api';
import { runImportParse } from './import-run';
import { writeImportMedia, type MediaPhaseDeps, type ThumbnailResult } from './import-media';
import { listMediaEntries, readZipEntryBytes } from './archive-reader';
import { writeMediaFile } from './media-writer';
import { deleteMediaFile } from '../storage/media-store';
import { IMPORT_LIMITS } from '../core/limits';
import { PARSER_VERSION } from '../core/parser';
import type { ImportCommitInput, ImportCommitResult } from '../storage/sqlite/import-commit';
import type { Result } from '../core/result';

/** Error detail is already structured; phase modules never throw expected
 * failures. Unexpected exceptions serialize to INTERNAL (§18.7). */
function toInternalError(error: unknown): ImportError {
  return { code: 'INTERNAL', detail: String(error).slice(0, 200) };
}

/** Real SHA-256 for §8.10 fingerprints (workers: crypto.subtle). */
const hashViaSubtle = async (bytes: Uint8Array): Promise<Uint8Array> => {
  const digest = await crypto.subtle.digest('SHA-256', bytes.buffer as ArrayBuffer);
  return new Uint8Array(digest);
};

/** Production IO over the picked archive and worker-only OPFS handles
 * (§9.2 step 8, §10.4). Thin adapter — the logic lives in import-media.ts. */
function mediaDeps(file: Blob): MediaPhaseDeps {
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

/** Commit-port protocol (§3.2): requests carry a requestId; the answer with
 * the matching id resolves the wait. */
interface CommitRequest {
  readonly type: 'commit';
  readonly requestId: number;
  readonly input: ImportCommitInput;
}

interface CommitAnswer {
  readonly type: 'commit-result' | 'commit-error';
  readonly requestId: number;
  readonly result?: ImportCommitResult;
  readonly detail?: string;
}

/** Sends the commit request over the port and waits for the answer (§3.2:
 * import.worker → db.worker; db.worker owns SQLite). */
function commitOverPort(
  port: MessagePort,
  input: ImportCommitInput,
): Promise<Result<ImportCommitResult, ImportError>> {
  const requestId = Math.floor(Math.random() * 2 ** 31);
  return new Promise((resolve) => {
    port.onmessage = (event: MessageEvent) => {
      const data = event.data as CommitAnswer;
      if (data.requestId !== requestId) {
        return;
      }
      if (data.type === 'commit-result' && data.result !== undefined) {
        resolve({ ok: true, value: data.result });
        return;
      }
      resolve({
        ok: false,
        error: { code: 'COMMIT_FAILED', detail: (data.detail ?? 'commit failed').slice(0, 160) },
      });
    };
    port.postMessage({ type: 'commit', requestId, input } satisfies CommitRequest);
  });
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

  async begin(options: BeginOptions): Promise<BeginAnswer> {
    const { file, fileName, confirmed, importId, commitPort, hooks } = options;
    const startedAt = Date.now();
    try {
      // §9.2 steps 1–3: re-read the archive (the detection read is not kept
      // — the worker stays stateless between detect and begin).
      hooks.onProgress({ phase: 'reading-archive', current: 0, total: 1 });
      const named = file as Blob & { readonly name: string };
      Object.defineProperty(named, 'name', { value: fileName, configurable: true });
      const archive = await import('./archive-reader').then((m) => m.readArchive(named));
      if (!archive.ok) {
        return { ok: false, error: { code: archive.error.code, detail: archive.error.detail } };
      }

      // §9.2 steps 6–7: parse + fingerprint with the CONFIRMED format.
      const run = await runImportParse(archive.value.text, confirmed.format, hashViaSubtle, hooks);
      if (!run.ok) {
        return { ok: false, error: run.error };
      }

      // §9.2 steps 8–9: media writes with §9.3 rollback bookkeeping (batches
      // of 100 flush through the hooks during the phase).
      const media = await writeImportMedia(
        confirmed.chatId,
        run.value.messages,
        mediaDeps(file),
        hooks,
      );
      if (!media.ok) {
        return { ok: false, error: media.error };
      }

      // Final written-paths flush so the import row is complete BEFORE the
      // commit (§9.3 crash safety). The client persists the list via RPC.
      await hooks.onWrittenPaths?.(media.value.writtenPaths);

      // §9.2 step 10: commit over the port.
      const input: ImportCommitInput = {
        importId,
        targetChatId: confirmed.chatId,
        newChat: {
          title: confirmed.title,
          isGroup: confirmed.isGroup,
          sourcePlatform: confirmed.format.platform,
          dateOrder: confirmed.format.dateOrder,
        },
        messages: run.value.messages,
        attachments: media.value.attachments,
        fileName,
        fileBytes: file.size,
        parserVersion: PARSER_VERSION,
      };
      const committed = await commitOverPort(commitPort, input);
      if (!committed.ok) {
        return { ok: false, error: committed.error };
      }

      // §9.2 step 11: report facts for the UI.
      return {
        ok: true,
        commit: committed.value,
        report: {
          warningsByCode: run.value.warningsByCode,
          stats: run.value.stats,
          replacementChars: run.value.replacementChars,
          durationMs: Date.now() - startedAt,
        },
      };
    } catch (error) {
      return { ok: false, error: toInternalError(error) };
    }
  },
};

// Expose the API. Comlink's expose returns void; the worker stays alive
// serving messages until terminated.
Comlink.expose(api, self);
