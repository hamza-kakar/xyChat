/**
 * Import media phase (AGENTS.md §9.2 steps 8–9, §9.3): for every media
 * message referenced by the confirmed export, STREAMS the entry bytes from
 * the opened archive into OPFS through the sync-handle sink (review Major
 * 9: one opened zip, chunked writes, nothing buffered whole), generates
 * JPEG thumbnails for images, and produces the attachment rows for the
 * commit. Fingerprints already `present` in the stored chat are SKIPPED —
 * re-importing a 1 GB export writes nothing (§9.2 step 8, review Blocker).
 * Missing files become `missing` rows; parser-omitted media becomes
 * `omitted` rows (§8.6).
 *
 * All IO is dependency-injected (§18.4): the worker passes the production
 * adapters (import.worker.ts), Node tests pass fakes. Written paths are
 * tracked and flushed CUMULATIVELY after every write (§9.2 step 8 flushed
 * every 100 files in the production hook; §9.3 rollback deletes exactly
 * what was written).
 */
import { err, ok, type Result } from '../core/result';
import { IMPORT_LIMITS } from '../core/limits';
import { newAttachmentId, type ChatId } from '../core/ids';
import { mediaTypeForFileName, mimeForFileName } from '../core/parser/attachments';
import { extensionOf, mediaPathFor, thumbPathFor } from '../storage/media-paths';
import type { InsertableAttachment, InsertableMessage } from '../storage/sqlite/import-commit';
import type { ArchiveError, OpenedArchive } from './archive-reader';
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

/** Injectable IO for the media phase (§18.4). The opened archive is the
 * ONE zip reader shared by the whole phase (review Major 9). */
export interface MediaPhaseDeps {
  /** The opened archive (single central-directory parse). */
  readonly archive: OpenedArchive;
  /** Safe non-text entries with their declared sizes. */
  readonly listEntries: () => Promise<
    Result<readonly { readonly name: string; readonly size: number }[], ArchiveError>
  >;
  /** Opens an OPFS file and returns its streaming sink (worker sync
   * handle); the caller streams chunks and closes. */
  readonly openWriteSink: (
    path: string,
  ) => Promise<
    Result<
      { readonly write: (chunk: Uint8Array) => Promise<void>; readonly close: () => Promise<void> },
      string
    >
  >;
  /** Buffers one SMALL entry whole — thumbnail inputs only. */
  readonly readEntryBuffered: (name: string) => Promise<Result<Uint8Array, ArchiveError>>;
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
  /** Fingerprints whose media is ALREADY stored (§9.2 step 8: skip). */
  readonly alreadyStored: ReadonlySet<string>;
  readonly attachments: InsertableAttachment[];
  readonly writtenPaths: string[];
}

/**
 * Writes media for the confirmed import and builds attachment rows.
 *
 * @param chatId The chat id minted by the caller; media paths key on it.
 * @param messages The fingerprinted messages (from runImportParse).
 * @param alreadyStored Fingerprints whose media the stored chat already
 *   holds — their files are NOT rewritten (§9.2 step 8, review Blocker).
 * @param deps Injectable IO (§18.4).
 * @param hooks Progress (writing-media, thumbnails), cancellation, and the
 *   cumulative written-path flush (§9.2 step 8).
 * @returns Attachment rows + written paths, or a structured failure. On
 *   cancellation or write failure every path written so far is deleted
 *   (§9.3) before the error is returned.
 */
/** Everything writeImportMedia needs, as one options object (§18.2). */
export interface MediaPhaseOptions {
  readonly chatId: string;
  readonly messages: readonly InsertableMessage[];
  /** Fingerprints whose media the stored chat already holds — skipped. */
  readonly alreadyStored: ReadonlySet<string>;
  readonly deps: MediaPhaseDeps;
  readonly hooks: ImportHooks;
}

export async function writeImportMedia(
  options: MediaPhaseOptions,
): Promise<Result<MediaPhaseResult, ImportError>> {
  const { chatId, messages, alreadyStored, deps, hooks } = options;
  const media = await deps.listEntries();
  if (!media.ok) {
    return err(fromArchiveError(media.error));
  }

  const ctx: MediaContext = {
    chatId,
    deps,
    hooks,
    zipSizes: new Map(media.value.map((entry) => [entry.name, entry.size])),
    alreadyStored,
    attachments: [],
    writtenPaths: [],
  };

  const referenced = messages.filter(
    (item) =>
      item.message.attachment?.status === 'referenced' && !alreadyStored.has(item.fingerprint),
  );
  const omitted = messages.filter((item) => item.message.attachment?.status === 'omitted');

  // §9.1 determinate thumbnails: count the qualifying images up front and
  // report a running current/total for the whole phase (review Minor).
  const thumbnailTotal = referenced.filter((item) => {
    const name = item.message.attachment?.fileName ?? '';
    return (
      ctx.zipSizes.has(name) &&
      (ctx.zipSizes.get(name) ?? 0) <= IMPORT_LIMITS.maxMediaEntryBytes &&
      deps.thumbnailTypes.has(mediaTypeForFileName(name))
    );
  }).length;

  let done = 0;
  let thumbnailsDone = 0;
  const thumbnailHooks: ImportHooks = {
    ...hooks,
    onProgress: (event) => {
      if (event.phase === 'thumbnails') {
        thumbnailsDone += 1;
        hooks.onProgress({ phase: 'thumbnails', current: thumbnailsDone, total: thumbnailTotal });
        return;
      }
      hooks.onProgress(event);
    },
  };
  const ctxWithThumbHooks: MediaContext = { ...ctx, hooks: thumbnailHooks };

  for (const item of referenced) {
    if (await hooks.isCancelled()) {
      return fail(ctx, { code: 'CANCELLED', detail: 'cancelled during media writes' });
    }
    const row = await writeReferenced(ctxWithThumbHooks, item);
    if (!row.ok) {
      return fail(ctx, row.error);
    }
    ctx.attachments.push(row.value);
    done += 1;
    hooks.onProgress({ phase: 'writing-media', current: done, total: referenced.length });
    // §9.3: cancellation is honored after every item too — a cancel during
    // a long write does not wait for the next item's boundary.
    if (await hooks.isCancelled()) {
      return fail(ctx, { code: 'CANCELLED', detail: 'cancelled during media writes' });
    }
  }

  for (const item of omitted) {
    ctx.attachments.push(omittedRow(item));
    done += 1;
    hooks.onProgress({ phase: 'writing-media', current: done, total: referenced.length });
  }

  return ok({ attachments: ctx.attachments, writtenPaths: ctx.writtenPaths });
}

/** Writes one referenced attachment: STREAMS the entry from the opened
 * archive into OPFS, plus a thumbnail for images (§9.2 steps 8–9). */
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

  const extension = extensionOf(fileName);
  const path = mediaPathFor(ctx.chatId as ChatId, attachmentId, extension);
  const bytes = await streamEntryToOpfs(ctx, fileName, path);
  if (!bytes.ok) {
    return err(bytes.error);
  }
  ctx.writtenPaths.push(path);
  await flushWrittenPaths(ctx);

  const thumbnail = await makeThumbnailFor(ctx, mediaType, fileName);
  let thumbPath: string | null = null;
  let width: number | null = null;
  let height: number | null = null;
  if (thumbnail !== null) {
    thumbPath = thumbPathFor(ctx.chatId as ChatId, attachmentId);
    const sink = await ctx.deps.openWriteSink(thumbPath);
    if (!sink.ok) {
      // §9.2 step 9: a failed thumbnail degrades to no thumbnail.
      thumbPath = null;
    } else {
      await sink.value.write(thumbnail.data);
      await sink.value.close();
      ctx.writtenPaths.push(thumbPath);
      await flushWrittenPaths(ctx);
      width = thumbnail.width;
      height = thumbnail.height;
    }
    ctx.hooks.onProgress({ phase: 'thumbnails', current: 0, total: 1 });
  }

  return ok({
    ...base,
    status: 'present' as const,
    byteSize: bytes.value,
    opfsPath: path,
    thumbPath,
    width,
    height,
  });
}

/** Streams one archive entry into the OPFS sink path (review Major 9:
 * chunked writes through the sync handle — nothing buffered whole). */
async function streamEntryToOpfs(
  ctx: MediaContext,
  fileName: string,
  path: string,
): Promise<Result<number, ImportError>> {
  const sink = await ctx.deps.openWriteSink(path);
  if (!sink.ok) {
    return err({
      code: sink.error.includes('quota') ? 'QUOTA_EXCEEDED' : 'INTERNAL',
      detail: sink.error.slice(0, 80),
    });
  }
  let bytes = 0;
  const streamed = await ctx.deps.archive.streamEntry(fileName, (chunk) => {
    bytes += chunk.byteLength;
    void sink.value.write(chunk);
    return bytes;
  });
  await sink.value.close();
  if (!streamed.ok) {
    return err(fromArchiveError(streamed.error));
  }
  return ok(bytes);
}

/** Emits the CUMULATIVE written-path list after every successful write
 * (§9.2 step 8 flushed every 100 files in the production hook; the list is
 * cumulative so each flush replaces the row with a SUPERSET — review
 * Blocker). Serialized by the per-item await chain. */
async function flushWrittenPaths(ctx: MediaContext): Promise<void> {
  const onWrittenPaths = ctx.hooks.onWrittenPaths;
  if (onWrittenPaths === undefined) {
    return;
  }
  await onWrittenPaths([...ctx.writtenPaths]);
}

/** Generates a thumbnail when the type qualifies; every failure degrades to
 * null (§9.2 step 9). Thumbnails need decodable bytes — small entries are
 * buffered through readEntryBuffered (images only; the §15.2 cap applies). */
async function makeThumbnailFor(
  ctx: MediaContext,
  mediaType: string,
  fileName: string,
): Promise<ThumbnailResult | null> {
  if (ctx.deps.makeThumbnail === null || !ctx.deps.thumbnailTypes.has(mediaType)) {
    return null;
  }
  const buffered = await ctx.deps.readEntryBuffered(fileName);
  if (!buffered.ok) {
    return null;
  }
  try {
    return await ctx.deps.makeThumbnail(buffered.value);
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

/** Maps an archive-read failure onto import error codes. */
function fromArchiveError(error: ArchiveError): ImportError {
  return { code: error.code, detail: error.detail };
}
