/**
 * Import media phase (AGENTS.md §9.2 steps 8–9, §9.3): for every media
 * message referenced by the confirmed export, streams the entry bytes to
 * OPFS (worker-only sync handles via media-writer), generates JPEG
 * thumbnails for images, and produces the attachment rows for the commit.
 * Missing files become `missing` rows; parser-omitted media becomes
 * `omitted` rows (§8.6).
 *
 * All IO is dependency-injected (§18.4): the worker passes the real OPFS
 * implementations (productionMediaDeps), Node tests pass fakes — including
 * cancellation and rollback (§9.3: every written path is tracked so a
 * cancel or failure deletes exactly those files).
 */
import { err, ok, type Result } from '../core/result';
import { IMPORT_LIMITS } from '../core/limits';

import { newAttachmentId, type ChatId } from '../core/ids';
import { mediaTypeForFileName, mimeForFileName } from '../core/parser/attachments';
import { extensionOf, mediaPathFor, thumbPathFor } from '../storage/media-paths';
import type { InsertableAttachment, InsertableMessage } from '../storage/sqlite/import-commit';
import type { ArchiveError } from './archive-reader';
import type { ImportError } from './import-detect';
import type { ImportHooks } from './import-progress';

/** Alias used by tests and the worker shell. */
export type ImportMediaHooks = ImportHooks;

/** A generated thumbnail (JPEG bytes plus the original dimensions). */
export interface ThumbnailResult {
  readonly data: Uint8Array;
  readonly width: number;
  readonly height: number;
}

/** Injectable IO for the media phase (§18.4). */
export interface MediaPhaseDeps {
  /** Lists the archive's safe non-text entries (name + declared size). */
  readonly listEntries: () => Promise<
    Result<readonly { readonly name: string; readonly size: number }[], ArchiveError>
  >;
  /** Reads one entry's bytes. */
  readonly readEntry: (name: string) => Promise<Result<Uint8Array, ArchiveError>>;
  /** Writes bytes to a canonical OPFS path (worker sync handles). */
  readonly writeFile: (
    path: string,
    bytes: Uint8Array,
  ) => Promise<Result<{ readonly bytes: number }, string>>;
  /** Deletes one written path (rollback, §9.3). */
  readonly deleteFile: (path: string) => Promise<boolean>;
  /** JPEG thumbnail generator; null produces no thumbnails (§9.2 step 9 —
   * the gallery shows a type icon instead). */
  readonly makeThumbnail: ((bytes: Uint8Array) => Promise<ThumbnailResult | null>) | null;
  /** Media types that get thumbnails (production: images only, §12.6). */
  readonly thumbnailTypes: ReadonlySet<string>;
}

/** The media phase outcome: attachment rows for the commit plus every OPFS
 * path written (for recordWrittenPaths and rollback, §9.3). */
export interface MediaPhaseResult {
  readonly attachments: readonly InsertableAttachment[];
  readonly writtenPaths: readonly string[];
}

/** Mutable phase context threaded through the helpers (§18.2 max-params). */
interface MediaContext {
  readonly chatId: string;
  readonly deps: MediaPhaseDeps;
  readonly hooks: ImportHooks;
  readonly zipSizes: ReadonlyMap<string, number>;
  readonly attachments: InsertableAttachment[];
  readonly writtenPaths: string[];
  /** Count already emitted through onWrittenPaths (§9.2 step 8). */
  flushedPaths: number;
}

/**
 * Writes media for the confirmed import and builds attachment rows.
 *
 * @param chatId The chat id minted by the caller; media paths key on it.
 * @param messages The fingerprinted messages (from runImportParse).
 * @param deps Injectable IO (§18.4).
 * @param hooks Progress (writing-media, thumbnails) and cancellation.
 * @returns Attachment rows + written paths, or a structured failure. On
 *   cancellation or write failure every path written so far is deleted
 *   (§9.3) before the error is returned.
 */
export async function writeImportMedia(
  chatId: string,
  messages: readonly InsertableMessage[],
  deps: MediaPhaseDeps,
  hooks: ImportHooks,
): Promise<Result<MediaPhaseResult, ImportError>> {
  const media = await deps.listEntries();
  if (!media.ok) {
    return err(fromArchiveError(media.error));
  }

  const ctx: MediaContext = {
    chatId,
    deps,
    hooks,
    zipSizes: new Map(media.value.map((entry) => [entry.name, entry.size])),
    attachments: [],
    writtenPaths: [],
    flushedPaths: 0,
  };

  const referenced = messages.filter((item) => item.message.attachment?.status === 'referenced');
  const omitted = messages.filter((item) => item.message.attachment?.status === 'omitted');
  const total = referenced.length + omitted.length;
  let done = 0;

  for (const item of referenced) {
    if (await hooks.isCancelled()) {
      return fail(ctx, { code: 'CANCELLED', detail: 'cancelled during media writes' });
    }
    const row = await writeReferenced(ctx, item);
    if (!row.ok) {
      return fail(ctx, row.error);
    }
    ctx.attachments.push(row.value);
    done += 1;
    hooks.onProgress({ phase: 'writing-media', current: done, total });
    // §9.3: cancellation is honored after every item too — a cancel during
    // a long write does not wait for the next item's boundary.
    if (await hooks.isCancelled()) {
      return fail(ctx, { code: 'CANCELLED', detail: 'cancelled during media writes' });
    }
  }

  for (const item of omitted) {
    ctx.attachments.push(omittedRow(item));
    done += 1;
    hooks.onProgress({ phase: 'writing-media', current: done, total });
  }

  return ok({ attachments: ctx.attachments, writtenPaths: ctx.writtenPaths });
}

/** Writes one referenced attachment: bytes from the archive to OPFS plus a
 * thumbnail for images (§9.2 steps 8–9). */
async function writeReferenced(
  ctx: MediaContext,
  item: InsertableMessage,
): Promise<Result<InsertableAttachment, ImportError>> {
  const attachment = item.message.attachment;
  const fileName = attachment?.fileName ?? null;
  const attachmentId = newAttachmentId();
  const mediaType = mediaTypeForFileName(fileName ?? '');
  const mime = fileName === null ? null : mimeForFileName(fileName);
  const base = {
    id: attachmentId,
    fingerprintOfMessage: item.fingerprint,
    fileName,
    mediaType,
    mime,
    byteSize: null,
    opfsPath: null,
    thumbPath: null,
    width: null,
    height: null,
    durationMs: null,
  };

  const withinCap =
    fileName !== null &&
    ctx.zipSizes.has(fileName) &&
    (ctx.zipSizes.get(fileName) ?? 0) <= IMPORT_LIMITS.maxMediaEntryBytes;
  if (fileName === null || !withinCap) {
    // §8.6: referenced but the file is absent or over the §15.2 cap.
    return ok({ ...base, status: 'missing' as const });
  }

  const bytes = await ctx.deps.readEntry(fileName);
  if (!bytes.ok) {
    return err(fromArchiveError(bytes.error));
  }

  const extension = extensionOf(fileName);
  const path = mediaPathFor(ctx.chatId as ChatId, attachmentId, extension);
  const written = await ctx.deps.writeFile(path, bytes.value);
  if (!written.ok) {
    return err({
      code: written.error.includes('quota') ? 'QUOTA_EXCEEDED' : 'INTERNAL',
      detail: written.error.slice(0, 160),
    });
  }
  ctx.writtenPaths.push(path);

  const thumbnail = await makeThumbnailFor(ctx, mediaType, bytes.value);
  let thumbPath: string | null = null;
  let width: number | null = null;
  let height: number | null = null;
  if (thumbnail !== null) {
    thumbPath = thumbPathFor(ctx.chatId as ChatId, attachmentId);
    const stored = await ctx.deps.writeFile(thumbPath, thumbnail.data);
    if (stored.ok) {
      ctx.writtenPaths.push(thumbPath);
      flushWrittenPaths(ctx);
      width = thumbnail.width;
      height = thumbnail.height;
    } else {
      // §9.2 step 9: a failed thumbnail degrades to no thumbnail.
      thumbPath = null;
    }
    ctx.hooks.onProgress({ phase: 'thumbnails', current: 1, total: 1 });
  }

  return ok({
    ...base,
    status: 'present' as const,
    byteSize: bytes.value.byteLength,
    opfsPath: path,
    thumbPath,
    width,
    height,
  });
}

/** Generates a thumbnail when the type qualifies; every failure degrades to
 * null (§9.2 step 9). */
async function makeThumbnailFor(
  ctx: MediaContext,
  mediaType: string,
  bytes: Uint8Array,
): Promise<ThumbnailResult | null> {
  if (ctx.deps.makeThumbnail === null || !ctx.deps.thumbnailTypes.has(mediaType)) {
    return null;
  }
  try {
    return await ctx.deps.makeThumbnail(bytes);
  } catch {
    return null;
  }
}

/** Builds the `omitted` attachment row for a parser-omitted media message
 * (§8.6: no file name — the export was made without media). */
function omittedRow(item: InsertableMessage): InsertableAttachment {
  const mediaType = item.message.attachment?.mediaType ?? 'other';
  return {
    id: newAttachmentId(),
    fingerprintOfMessage: item.fingerprint,
    fileName: null,
    mediaType,
    mime: null,
    byteSize: null,
    opfsPath: null,
    thumbPath: null,
    width: null,
    height: null,
    durationMs: null,
    status: 'omitted',
  };
}

/** Rollback on cancel/failure (§9.3): best-effort delete of every written
 * path, then the structured error. Attachment rows are never persisted —
 * the commit never ran. */
async function fail(
  ctx: MediaContext,
  error: ImportError,
): Promise<Result<MediaPhaseResult, ImportError>> {
  for (const path of ctx.writtenPaths) {
    await ctx.deps.deleteFile(path);
  }
  return err(error);
}

/** Emits the written paths in batches of 100 for crash-safety
 * bookkeeping (§9.2 step 8: flushed every 100 files). */
function flushWrittenPaths(ctx: MediaContext): void {
  const onWrittenPaths = ctx.hooks.onWrittenPaths;
  if (onWrittenPaths === undefined) {
    return;
  }
  if (ctx.writtenPaths.length - ctx.flushedPaths >= WRITE_FLUSH_EVERY) {
    const batch = ctx.writtenPaths.slice(ctx.flushedPaths);
    ctx.flushedPaths = ctx.writtenPaths.length;
    // Fire-and-forget bookkeeping: the client persists the batch; the final
    // full-list flush before the commit is awaited there (§9.3).
    void Promise.resolve(onWrittenPaths(batch));
  }
}

/** Written paths per bookkeeping flush (§9.2 step 8). */
const WRITE_FLUSH_EVERY = 100;

/** Maps an archive-read failure onto import error codes. */
function fromArchiveError(error: ArchiveError): ImportError {
  return { code: error.code, detail: error.detail };
}
