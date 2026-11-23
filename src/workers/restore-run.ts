/**
 * Restore, second step: for each backup chat the user
 * chose to restore, copy its media into OPFS, then commit every chat in
 * one transaction (merge fingerprints, replace, or add as new).
 * The rollback rules of apply: each chat has an in_progress import
 * row listing its written files, so a cancel, a failure or a crash leaves
 * nothing behind.
 */
import { err, ok, type Result } from '../core/result';
import { asChatId, newChatId, newImportId } from '../core/ids';
import { PARSER_VERSION } from '../core/parser/version';
import { readBackupChat, type BackupChatContent } from '../storage/sqlite/backup-read';
import { createImportRecord } from '../storage/sqlite/import-record';
import {
  commitRestore,
  type RestoreAction,
  type RestoreChatPlan,
} from '../storage/sqlite/restore-commit';
import type { SqliteChatRepository } from '../storage/sqlite/sqlite-repository';
import type { ScratchDatabases } from '../storage/sqlite/scratch-db';
import { closeBackup, listLocalChats, openBackup, type OpenedBackup } from './restore-inspect';
import type {
  RestoreChatReport,
  RestoreDecision,
  RestoreError,
  RestoreRequest,
} from './transfer-types';
import {
  restoreChatMedia,
  willCopy,
  type RestoreMediaDeps,
  type RestoreMediaRun,
  type RestoredMedia,
} from './restore-media';
import type { TransferHooks } from './transfer-hooks';

/** Everything a restore run touches (test seam). */
export interface RestoreRunDeps extends RestoreMediaDeps {
  readonly repo: SqliteChatRepository;
  readonly scratch: ScratchDatabases;
  readonly deleteFile: (path: string) => Promise<boolean>;
  /** Free storage in bytes (quota − usage). */
  readonly estimateFreeBytes: () => Promise<number>;
}

/** One chosen chat with its resolved target. */
interface Draft {
  readonly action: RestoreAction;
  readonly targetChatId: string;
  readonly content: BackupChatContent;
  readonly importId: string;
  readonly alreadyStored: ReadonlySet<string>;
}

/** Resolves each non-skipped choice to a target chat and reads its rows. */
function draftChats(
  deps: RestoreRunDeps,
  opened: OpenedBackup,
  decisions: readonly RestoreDecision[],
): Result<Omit<Draft, 'importId'>[], RestoreError> {
  const localIds = new Set(listLocalChats(deps.repo.database).map((chat) => chat.chatId));
  const drafts: Omit<Draft, 'importId'>[] = [];
  for (const decision of decisions) {
    if (decision.choice === 'skip') {
      continue;
    }
    const content = readBackupChat(opened.db, decision.backupChatId);
    if (!content.ok) {
      return err({ code: content.error.code });
    }
    let targetChatId: string;
    if (decision.choice === 'new') {
      targetChatId = localIds.has(decision.backupChatId) ? newChatId() : decision.backupChatId;
    } else if (decision.targetChatId !== null && localIds.has(decision.targetChatId)) {
      targetChatId = decision.targetChatId;
    } else {
      return err({ code: 'TARGET_NOT_FOUND' });
    }
    // Two choices may not land in one chat (a replace would delete the other).
    localIds.add(targetChatId);
    if (drafts.some((draft) => draft.targetChatId === targetChatId)) {
      return err({ code: 'TARGET_NOT_FOUND' });
    }
    const alreadyStored =
      decision.choice === 'merge'
        ? new Set(deps.repo.listStoredFingerprints(asChatId(targetChatId)))
        : new Set<string>();
    drafts.push({ action: decision.choice, targetChatId, content: content.value, alreadyStored });
  }
  return drafts.length === 0 ? err({ code: 'NOTHING_TO_RESTORE' }) : ok(drafts);
}

/** Quota check: free space for 1.1× the media to copy. */
async function hasRoom(
  deps: RestoreRunDeps,
  opened: OpenedBackup,
  drafts: readonly Omit<Draft, 'importId'>[],
): Promise<boolean> {
  let needed = 0;
  for (const draft of drafts) {
    for (const attachment of draft.content.attachments) {
      if (willCopy(opened.archive, attachment, draft.alreadyStored)) {
        needed += attachment.byteSize ?? 0;
      }
    }
  }
  try {
    return (await deps.estimateFreeBytes()) >= Math.ceil(needed * 1.1);
  } catch {
    // An unavailable estimate must not block the restore; writes surface
    // their own quota errors.
    return true;
  }
}

/** Removes everything a stopped restore wrote and closes its import rows. */
async function rollBack(
  deps: RestoreRunDeps,
  run: RestoreMediaRun,
  drafts: readonly Draft[],
  status: 'cancelled' | 'failed',
): Promise<void> {
  await Promise.all(run.written.map((path) => deps.deleteFile(path)));
  for (const draft of drafts) {
    if (status === 'cancelled') {
      deps.repo.markImportCancelled(draft.importId);
    } else {
      deps.repo.markImportFailed(draft.importId);
    }
  }
}

/** Builds the commit plan of one chat from its copied media. */
function planFor(
  draft: Draft,
  request: RestoreRequest,
  media: RestoredMedia,
  startedAt: number,
): RestoreChatPlan {
  const { content } = draft;
  return {
    action: draft.action,
    replaceChatId: draft.action === 'replace' ? draft.targetChatId : null,
    selfName: content.selfName,
    bookmarks: content.bookmarks,
    commit: {
      importId: draft.importId,
      targetChatId: draft.targetChatId,
      newChat: {
        title: content.title,
        isGroup: content.isGroup,
        sourcePlatform: content.sourcePlatform,
        dateOrder: content.dateOrder,
      },
      messages: content.messages,
      attachments: media.attachments,
      fileName: request.fileName,
      fileBytes: request.file.size,
      parserVersion: content.parserVersion ?? PARSER_VERSION,
      report: {
        warningsByCode: {},
        mediaStored: media.stored,
        mediaMissing: media.missing,
        mediaOmitted: media.omitted,
        durationMs: Math.max(0, Math.round(Date.now() - startedAt)),
      },
    },
  };
}

/** Copies media for every draft, then commits them together. */
async function restoreDrafts(
  deps: RestoreRunDeps,
  session: {
    readonly opened: OpenedBackup;
    readonly request: RestoreRequest;
    readonly hooks: TransferHooks;
  },
  drafts: readonly Draft[],
): Promise<Result<readonly RestoreChatReport[], RestoreError>> {
  const { opened, request, hooks } = session;
  const startedAt = Date.now();
  const run: RestoreMediaRun = {
    archive: opened.archive,
    hooks,
    total: drafts.reduce(
      (sum, draft) =>
        sum +
        draft.content.attachments.filter((a) => willCopy(opened.archive, a, draft.alreadyStored))
          .length,
      0,
    ),
    done: 0,
    written: [],
    flushWritten: (importId, paths) => {
      deps.repo.recordWrittenPaths(importId, paths);
    },
  };
  const plans: RestoreChatPlan[] = [];
  const mediaCounts: { stored: number; missing: number }[] = [];
  for (const draft of drafts) {
    const media = await restoreChatMedia(deps, run, {
      targetChatId: draft.targetChatId,
      importId: draft.importId,
      attachments: draft.content.attachments,
      alreadyStored: draft.alreadyStored,
    });
    if (!media.ok) {
      await rollBack(deps, run, drafts, media.error.code === 'CANCELLED' ? 'cancelled' : 'failed');
      return media;
    }
    plans.push(planFor(draft, request, media.value, startedAt));
    mediaCounts.push({ stored: media.value.stored, missing: media.value.missing });
  }
  hooks.onProgress({ phase: 'committing', current: 0, total: 1 });
  const replacedPaths = drafts
    .filter((draft) => draft.action === 'replace')
    .flatMap((draft) => deps.repo.listChatMediaPaths(asChatId(draft.targetChatId)));
  let results;
  try {
    results = commitRestore(deps.repo.database, plans);
  } catch (error) {
    await rollBack(deps, run, drafts, 'failed');
    throw error;
  }
  //  a replaced chat's old files go after the commit; a failure
  // here leaves orphans for the sweeper, never rows without files.
  await Promise.all(replacedPaths.map((path) => deps.deleteFile(path)));
  return ok(
    results.map((result, index) => ({
      chatId: result.chatId,
      title: drafts[index]?.content.title ?? '',
      action: result.action,
      messagesAdded: result.messagesInserted,
      duplicatesSkipped: result.duplicatesSkipped,
      mediaRestored: mediaCounts[index]?.stored ?? 0,
      mediaMissing: mediaCounts[index]?.missing ?? 0,
      bookmarksRestored: result.bookmarksRestored,
    })),
  );
}

/**
 * Restores the chosen chats of a backup.
 *
 * @param deps Database, OPFS access and the storage estimate.
 * @param request The backup file, its name and the per-chat choices.
 * @param hooks Progress and cancellation.
 * @returns One report per restored chat, or why the restore stopped (the
 *   database and OPFS are then as they were).
 */
export async function runRestore(
  deps: RestoreRunDeps,
  request: RestoreRequest,
  hooks: TransferHooks,
): Promise<Result<readonly RestoreChatReport[], RestoreError>> {
  hooks.onProgress({ phase: 'reading', current: 0, total: 1 });
  const opened = await openBackup(deps.scratch, request.file);
  if (!opened.ok) {
    return opened;
  }
  try {
    const drafted = draftChats(deps, opened.value, request.decisions);
    if (!drafted.ok) {
      return drafted;
    }
    if (!(await hasRoom(deps, opened.value, drafted.value))) {
      return err({ code: 'QUOTA_EXCEEDED' });
    }
    const drafts: Draft[] = drafted.value.map((draft) => {
      const importId = newImportId();
      createImportRecord(deps.repo.database, {
        importId,
        fileName: request.fileName,
        fileBytes: request.file.size,
        parserVersion: draft.content.parserVersion ?? PARSER_VERSION,
      });
      return { ...draft, importId };
    });
    return await restoreDrafts(deps, { opened: opened.value, request, hooks }, drafts);
  } finally {
    await closeBackup(opened.value);
  }
}
