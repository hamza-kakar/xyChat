/**
 * Import media phase: for every media
 * message referenced by the confirmed export, STREAMS the entry bytes from
 * the opened archive into OPFS through the sync-handle sink (one opened
 * zip, chunked writes, nothing buffered whole), generates
 * JPEG thumbnails for images, and produces the attachment rows for the
 * commit. Fingerprints already `present` in the stored chat are SKIPPED —
 * re-importing a 1 GB export writes nothing.
 * Missing files become `missing` rows; parser-omitted media becomes
 * `omitted` rows.
 *
 * All IO is dependency-injected: the worker passes the production
 * adapters (import.worker.ts), Node tests pass fakes. Every path is
 * recorded in memory before its file is created, and the CUMULATIVE list
 * is flushed to the imports row every WRITTEN_PATHS_FLUSH_EVERY paths and
 * once more when the phase ends or fails. After a crash,
 * boot rollback deletes the flushed paths; the at most 99 unflushed ones
 * are left for the orphan sweeper.
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
import type { MediaPhaseDeps, MediaPhaseResult } from './import-media-types';
import { NO_THUMBNAIL, qualifiesForThumbnail, storeThumbnail } from './import-media-thumbnail';

export type { MediaPhaseDeps, MediaPhaseResult, ThumbnailResult } from './import-media-types';

/** Alias used by tests and the worker shell. */
export type ImportMediaHooks = ImportHooks;

/** Per-phase progress counters (one determinate bar per phase). */
interface PhaseProgress {
  /** One media item (referenced or omitted) is finished. */
  readonly mediaItemDone: () => void;
  /** One qualifying image's thumbnail attempt is finished (success or not). */
  readonly thumbnailDone: () => void;
}

/** Mutable phase context threaded through the helpers (max-params). */
interface MediaContext {
  readonly chatId: string;
  readonly deps: MediaPhaseDeps;
  readonly hooks: ImportHooks;
  readonly progress: PhaseProgress;
  readonly zipSizes: ReadonlyMap<string, number>;
  readonly attachments: InsertableAttachment[];
  /** Every OPFS path this phase has touched, recorded BEFORE the file is
   * created. Shared with the caller (see MediaPhaseOptions.writtenPaths). */
  readonly writtenPaths: string[];
  /** How many of writtenPaths the last flush carried. */
  readonly flushed: { count: number };
}

/** Everything writeImportMedia needs, as one options object. */
export interface MediaPhaseOptions {
  readonly chatId: string;
  readonly messages: readonly InsertableMessage[];
  /** Fingerprints whose media the stored chat already holds — skipped. */
  readonly alreadyStored: ReadonlySet<string>;
  readonly deps: MediaPhaseDeps;
  readonly hooks: ImportHooks;
  /** Caller-owned list the phase appends every touched path to. Passing it
   * lets the caller roll back even if the phase throws unexpectedly.
   * A fresh list is used when omitted. */
  readonly writtenPaths?: string[];
}

/** Paths per written-path flush (every 100 files). */
export const WRITTEN_PATHS_FLUSH_EVERY = 100;

const CANCELLED: ImportError = { code: 'CANCELLED', detail: 'cancelled during media writes' };

/**
 * Writes media for the confirmed import and builds attachment rows.
 *
 * @param options The chat id, fingerprinted messages, already-stored
 *   fingerprints (their files are not rewritten), injectable IO,
 *   hooks (progress, cancellation, written-path flushes) and an
 *   optional shared written-path list.
 * @returns Attachment rows + written paths, or a structured failure. On
 *   cancellation or write failure every path touched so far is deleted
 *   before the error is returned. The phase never throws for IO
 *   failures; they become typed errors.
 */
export async function writeImportMedia(
  options: MediaPhaseOptions,
): Promise<Result<MediaPhaseResult, ImportError>> {
  const { chatId, messages, alreadyStored, deps, hooks } = options;
  const media = await deps.listEntries();
  if (!media.ok) {
    return err(fromArchiveError(media.error));
  }
  const zipSizes = new Map(media.value.map((entry) => [entry.name, entry.size]));

  const referenced = messages.filter(
    (item) =>
      item.message.attachment?.status === 'referenced' && !alreadyStored.has(item.fingerprint),
  );
  const omitted = messages.filter((item) => item.message.attachment?.status === 'omitted');
  const thumbnailTotal = referenced.filter((item) =>
    qualifiesForThumbnail(deps, zipSizes, item.message.attachment?.fileName ?? null),
  ).length;

  const ctx: MediaContext = {
    chatId,
    deps,
    hooks,
    progress: createProgress(hooks, referenced.length + omitted.length, thumbnailTotal),
    zipSizes,
    attachments: [],
    writtenPaths: options.writtenPaths ?? [],
    flushed: { count: 0 },
  };

  const written = await writeAllReferenced(ctx, referenced);
  if (!written.ok) {
    return fail(ctx, written.error);
  }
  for (const item of omitted) {
    ctx.attachments.push(omittedRow(item));
    ctx.progress.mediaItemDone();
  }
  await flushPaths(ctx);
  return ok({ attachments: ctx.attachments, writtenPaths: [...ctx.writtenPaths] });
}

/** Builds the progress counters for the writing-media and thumbnails
 * phases, each against its fixed total. */
function createProgress(
  hooks: ImportHooks,
  mediaTotal: number,
  thumbnailTotal: number,
): PhaseProgress {
  let mediaDone = 0;
  let thumbnailsDone = 0;
  return {
    mediaItemDone: () => {
      mediaDone += 1;
      hooks.onProgress({ phase: 'writing-media', current: mediaDone, total: mediaTotal });
    },
    thumbnailDone: () => {
      thumbnailsDone += 1;
      hooks.onProgress({ phase: 'thumbnails', current: thumbnailsDone, total: thumbnailTotal });
    },
  };
}

/** Writes every referenced attachment in order, honoring cancellation
 * before and after each item. */
async function writeAllReferenced(
  ctx: MediaContext,
  referenced: readonly InsertableMessage[],
): Promise<Result<void, ImportError>> {
  for (const item of referenced) {
    if (await ctx.hooks.isCancelled()) {
      return err(CANCELLED);
    }
    const row = await writeReferenced(ctx, item);
    if (!row.ok) {
      return err(row.error);
    }
    ctx.attachments.push(row.value);
    ctx.progress.mediaItemDone();
    if (await ctx.hooks.isCancelled()) {
      return err(CANCELLED);
    }
  }
  return ok(undefined);
}

/** Writes one referenced attachment: STREAMS the entry from the opened
 * archive into OPFS, plus a thumbnail for images. */
async function writeReferenced(
  ctx: MediaContext,
  item: InsertableMessage,
): Promise<Result<InsertableAttachment, ImportError>> {
  const fileName = item.message.attachment?.fileName ?? null;
  const attachmentId = newAttachmentId();
  const base = {
    id: attachmentId,
    fingerprintOfMessage: item.fingerprint,
    fileName,
    mediaType: mediaTypeForFileName(fileName ?? ''),
    mime: fileName === null ? null : mimeForFileName(fileName),
    byteSize: null,
    opfsPath: null,
    durationMs: null,
    ...NO_THUMBNAIL,
  };

  const size = fileName === null ? undefined : ctx.zipSizes.get(fileName);
  if (fileName === null || size === undefined || size > IMPORT_LIMITS.maxMediaEntryBytes) {
    //  referenced but the file is absent or over the cap.
    return ok({ ...base, status: 'missing' as const });
  }

  const path = mediaPathFor(ctx.chatId as ChatId, attachmentId, extensionOf(fileName));
  const stored = await streamEntryToOpfs(ctx, fileName, path);
  if (!stored.ok) {
    return err(stored.error);
  }
  const thumbnail = await storeThumbnail({
    deps: ctx.deps,
    zipSizes: ctx.zipSizes,
    fileName,
    thumbPath: thumbPathFor(ctx.chatId as ChatId, attachmentId),
    recordPath: (thumbPath) => recordPath(ctx, thumbPath),
    onAttemptDone: ctx.progress.thumbnailDone,
  });
  return ok({
    ...base,
    ...thumbnail,
    status: 'present' as const,
    byteSize: stored.value,
    opfsPath: path,
  });
}

/** Streams one archive entry into OPFS through the sink: chunked writes,
 * nothing buffered whole. The path is recorded before the sink opens,
 * because opening creates the file; a tab kill mid-entry then still leaves
 * it listed for boot rollback. */
async function streamEntryToOpfs(
  ctx: MediaContext,
  fileName: string,
  path: string,
): Promise<Result<number, ImportError>> {
  await recordPath(ctx, path);
  const sink = await ctx.deps.openWriteSink(path);
  if (!sink.ok) {
    return err({
      code: sink.error.includes('quota') ? 'QUOTA_EXCEEDED' : 'INTERNAL',
      detail: sink.error.slice(0, 80),
    });
  }
  let written = 0;
  let streamed: Result<{ readonly bytes: number }, ArchiveError>;
  try {
    streamed = await ctx.deps.archive.streamEntry(fileName, async (chunk) => {
      await sink.value.write(chunk);
      written += chunk.byteLength;
      return written;
    });
  } catch (error) {
    return err(fromWriteFailure(error));
  } finally {
    await sink.value.close();
  }
  if (!streamed.ok) {
    return err(fromArchiveError(streamed.error));
  }
  if (written !== streamed.value.bytes) {
    return err({ code: 'INTERNAL', detail: `short write: ${written} of ${streamed.value.bytes}` });
  }
  return ok(written);
}

/** Records a path before its file is created, flushing every
 * WRITTEN_PATHS_FLUSH_EVERY paths. */
async function recordPath(ctx: MediaContext, path: string): Promise<void> {
  ctx.writtenPaths.push(path);
  if (ctx.writtenPaths.length - ctx.flushed.count >= WRITTEN_PATHS_FLUSH_EVERY) {
    await flushPaths(ctx);
  }
}

/** Flushes the CUMULATIVE list when it holds unflushed paths, so each flush
 * replaces the imports row with a superset. */
async function flushPaths(ctx: MediaContext): Promise<void> {
  const onWrittenPaths = ctx.hooks.onWrittenPaths;
  if (onWrittenPaths === undefined || ctx.writtenPaths.length === ctx.flushed.count) {
    return;
  }
  ctx.flushed.count = ctx.writtenPaths.length;
  await onWrittenPaths([...ctx.writtenPaths]);
}

/** Builds the `omitted` attachment row for a parser-omitted media message
 * (no file name — the export was made without media). */
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

/** Rollback on cancel/failure: best-effort delete of every written
 * path, then the structured error. Attachment rows are never persisted —
 * the commit never ran. */
async function fail(
  ctx: MediaContext,
  error: ImportError,
): Promise<Result<MediaPhaseResult, ImportError>> {
  // Flush first: if the tab dies mid-delete, boot rollback finishes the job.
  await flushPaths(ctx);
  for (const path of ctx.writtenPaths) {
    await ctx.deps.deleteFile(path);
  }
  return err(error);
}

/** Maps an archive-read failure onto import error codes. */
function fromArchiveError(error: ArchiveError): ImportError {
  return { code: error.code, detail: error.detail };
}

/** Maps a thrown write failure (e.g. a quota error from the sync handle)
 * onto import error codes. Only the error name is kept. */
function fromWriteFailure(error: unknown): ImportError {
  const name = error instanceof Error ? error.name : 'unknown error';
  return { code: name === 'QuotaExceededError' ? 'QUOTA_EXCEEDED' : 'INTERNAL', detail: name };
}
