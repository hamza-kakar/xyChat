/**
 * Restore media phase (AGENTS.md §10.6, §9.2 step 8): copies one backup
 * chat's media and thumbnails out of the archive into OPFS under fresh
 * attachment ids, streaming each entry. Every path is recorded before it
 * is written, so a cancel, a failure or a crash removes it (§9.3).
 */
import { err, ok, type Result } from '../core/result';
import { asChatId, newAttachmentId } from '../core/ids';
import { BACKUP_LIMITS } from '../core/limits';
import { extensionOf, mediaPathFor, thumbPathFor } from '../storage/media-paths';
import type { BackupAttachment } from '../storage/sqlite/backup-read';
import type { InsertableAttachment } from '../storage/sqlite/import-commit';
import type { MediaWriteError, MediaWriteSink } from './media-writer';
import type { BackupArchive } from './backup-archive';
import type { RestoreError } from './transfer-types';
import type { TransferHooks } from './transfer-hooks';

/** OPFS access for the media phase (§18.4 test seam). */
export interface RestoreMediaDeps {
  readonly openSink: (path: string) => Promise<Result<MediaWriteSink, MediaWriteError>>;
}

/** Shared state of the media phase across all restored chats. */
export interface RestoreMediaRun {
  readonly archive: BackupArchive;
  readonly hooks: TransferHooks;
  /** Files to copy across all chats (progress total). */
  readonly total: number;
  /** Files copied so far (progress current). */
  done: number;
  /** Every path written so far, for rollback. */
  readonly written: string[];
  /** Persists the written paths of one import row (§9.3). */
  readonly flushWritten: (importId: string, paths: readonly string[]) => void;
}

/** One chat's media job. */
export interface RestoreMediaJob {
  readonly targetChatId: string;
  readonly importId: string;
  readonly attachments: readonly BackupAttachment[];
  /** Messages whose media the target chat already stores (merge). */
  readonly alreadyStored: ReadonlySet<string>;
}

/** One chat's attachment rows plus counts for the import report. */
export interface RestoredMedia {
  readonly attachments: readonly InsertableAttachment[];
  readonly stored: number;
  readonly missing: number;
  readonly omitted: number;
}

/**
 * True when an attachment's file will be copied: stored in the backup,
 * present in the archive, and not already stored in the target chat.
 */
export function willCopy(
  archive: BackupArchive,
  attachment: BackupAttachment,
  alreadyStored: ReadonlySet<string>,
): boolean {
  return (
    attachment.sourcePath !== null &&
    archive.hasEntry(attachment.sourcePath) &&
    !alreadyStored.has(attachment.fingerprintOfMessage)
  );
}

/** Streams one archive entry into one OPFS file; returns its byte count. */
async function copyEntry(
  deps: RestoreMediaDeps,
  run: RestoreMediaRun,
  entry: string,
  path: string,
): Promise<Result<number, RestoreError>> {
  const sink = await deps.openSink(path);
  if (!sink.ok) {
    return err({ code: sink.error.code === 'QUOTA' ? 'QUOTA_EXCEEDED' : 'IO' });
  }
  let bytes = 0;
  try {
    await run.archive.streamEntry(entry, async (chunk) => {
      await sink.value.write(chunk);
      bytes += chunk.byteLength;
      return bytes;
    });
    return ok(bytes);
  } catch {
    return err({ code: 'IO' });
  } finally {
    await sink.value.close();
  }
}

/** One chat's job plus the paths written for it so far. */
interface JobScope {
  readonly job: RestoreMediaJob;
  readonly mine: string[];
}

/** Records a path before writing it, flushing the import row now and then. */
function recordPath(run: RestoreMediaRun, scope: JobScope, path: string): void {
  run.written.push(path);
  scope.mine.push(path);
  if (scope.mine.length % BACKUP_LIMITS.writtenPathsFlushEvery === 1) {
    run.flushWritten(scope.job.importId, scope.mine);
  }
}

/** An attachment row without a file. */
function withoutFile(
  attachment: BackupAttachment,
  id: string,
  status: InsertableAttachment['status'],
): InsertableAttachment {
  return {
    id,
    fingerprintOfMessage: attachment.fingerprintOfMessage,
    fileName: attachment.fileName,
    mediaType: attachment.mediaType,
    mime: attachment.mime,
    byteSize: status === 'present' ? attachment.byteSize : null,
    opfsPath: null,
    thumbPath: null,
    width: attachment.width,
    height: attachment.height,
    durationMs: attachment.durationMs,
    status,
  };
}

/** Copies one attachment's file and thumbnail. */
async function copyAttachment(
  deps: RestoreMediaDeps,
  run: RestoreMediaRun,
  scope: JobScope,
  attachment: BackupAttachment & { readonly sourcePath: string },
): Promise<Result<InsertableAttachment, RestoreError>> {
  const id = newAttachmentId();
  const chatId = asChatId(scope.job.targetChatId);
  const path = mediaPathFor(chatId, id, extensionOf(attachment.sourcePath));
  recordPath(run, scope, path);
  const bytes = await copyEntry(deps, run, attachment.sourcePath, path);
  if (!bytes.ok) {
    return bytes;
  }
  let thumbPath: string | null = null;
  const thumbSource = attachment.sourceThumbPath;
  if (thumbSource !== null && run.archive.hasEntry(thumbSource)) {
    thumbPath = thumbPathFor(chatId, id);
    recordPath(run, scope, thumbPath);
    const thumb = await copyEntry(deps, run, thumbSource, thumbPath);
    if (!thumb.ok) {
      return thumb;
    }
  }
  return ok({
    ...withoutFile(attachment, id, 'present'),
    byteSize: bytes.value,
    opfsPath: path,
    thumbPath,
  });
}

/**
 * Copies one chat's media out of the archive.
 *
 * @param deps OPFS access.
 * @param run Shared media-phase state.
 * @param job The chat's attachments and target.
 * @returns Attachment rows for the commit, or why copying stopped
 *   (including `CANCELLED`).
 */
export async function restoreChatMedia(
  deps: RestoreMediaDeps,
  run: RestoreMediaRun,
  job: RestoreMediaJob,
): Promise<Result<RestoredMedia, RestoreError>> {
  const rows: InsertableAttachment[] = [];
  const mine: string[] = [];
  let stored = 0;
  let missing = 0;
  let omitted = 0;
  for (const attachment of job.attachments) {
    if (attachment.status === 'omitted') {
      omitted += 1;
      rows.push(withoutFile(attachment, newAttachmentId(), 'omitted'));
      continue;
    }
    if (job.alreadyStored.has(attachment.fingerprintOfMessage)) {
      // The local twin keeps its file; this row is never inserted.
      rows.push(withoutFile(attachment, newAttachmentId(), 'missing'));
      continue;
    }
    const { sourcePath } = attachment;
    if (sourcePath === null || !willCopy(run.archive, attachment, job.alreadyStored)) {
      missing += 1;
      rows.push(withoutFile(attachment, newAttachmentId(), 'missing'));
      continue;
    }
    if (await run.hooks.isCancelled()) {
      run.flushWritten(job.importId, mine);
      return err({ code: 'CANCELLED' });
    }
    const copied = await copyAttachment(deps, run, { job, mine }, { ...attachment, sourcePath });
    if (!copied.ok) {
      run.flushWritten(job.importId, mine);
      return copied;
    }
    stored += 1;
    rows.push(copied.value);
    run.done += 1;
    run.hooks.onProgress({ phase: 'media', current: run.done, total: run.total });
  }
  run.flushWritten(job.importId, mine);
  return ok({ attachments: rows, stored, missing, omitted });
}
