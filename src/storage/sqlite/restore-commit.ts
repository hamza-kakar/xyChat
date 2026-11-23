/**
 * Restore commit: every chosen backup chat lands in ONE
 * transaction. A chat restores through the import commit,
 * so a merge follows the fingerprint rules and the full-text index
 * fills as rows insert. "Replace" deletes the local chat in the same
 * transaction first; the caller deletes its old files after the commit.
 */
import type { SqliteDatabase } from './db-wrapper';
import {
  applyImportCommit,
  commitTimestamp,
  type ImportCommitInput,
  type ImportCommitResult,
} from './import-commit';
import { deleteChatRows } from './chat-delete';
import type { BackupBookmark } from './backup-read';

/** How one backup chat is restored. */
export type RestoreAction = 'new' | 'replace' | 'merge';

/** One backup chat ready to commit (media already written). */
export interface RestoreChatPlan {
  readonly action: RestoreAction;
  /** The local chat a "replace" deletes first; null otherwise. */
  readonly replaceChatId: string | null;
  /** Import input whose `targetChatId` is the chat the rows land in. */
  readonly commit: ImportCommitInput;
  /** The backup's "me", by display name. */
  readonly selfName: string | null;
  readonly bookmarks: readonly BackupBookmark[];
}

/** One restored chat's outcome. */
export interface RestoreChatResult extends ImportCommitResult {
  readonly action: RestoreAction;
  readonly bookmarksRestored: number;
}

/** Sets "me" from the backup unless the local chat already has one. */
function restoreSelf(db: SqliteDatabase, chatId: string, selfName: string | null): void {
  if (selfName === null) {
    return;
  }
  db.run(
    `UPDATE chats SET self_participant_id = (
       SELECT id FROM participants WHERE chat_id = ? AND display_name = ?)
     WHERE id = ? AND self_participant_id IS NULL`,
    [chatId, selfName, chatId],
  );
}

/** Adds the backup's bookmarks; a message bookmarked locally keeps its
 * own note. Returns the number added. */
function restoreBookmarks(
  db: SqliteDatabase,
  chatId: string,
  bookmarks: readonly BackupBookmark[],
): number {
  const before = Number(
    db.selectArrays('SELECT COUNT(*) FROM bookmarks WHERE chat_id = ?', [chatId])[0]?.[0] ?? 0,
  );
  db.runEach(
    `INSERT OR IGNORE INTO bookmarks (id, chat_id, message_id, note, created_at)
     SELECT ?, chat_id, id, ?, ? FROM messages WHERE chat_id = ? AND fingerprint = ?`,
    bookmarks.map((bookmark) => [
      crypto.randomUUID(),
      bookmark.note,
      bookmark.createdAt,
      chatId,
      bookmark.fingerprint,
    ]),
  );
  const after = Number(
    db.selectArrays('SELECT COUNT(*) FROM bookmarks WHERE chat_id = ?', [chatId])[0]?.[0] ?? 0,
  );
  return after - before;
}

/**
 * Commits a restore in ONE transaction: a failure leaves the database as
 * it was (the caller then removes the files it wrote).
 *
 * @param db The app database.
 * @param plans The chats to restore, in order.
 * @returns One result per plan.
 */
export function commitRestore(
  db: SqliteDatabase,
  plans: readonly RestoreChatPlan[],
): readonly RestoreChatResult[] {
  const now = commitTimestamp();
  return db.transaction(() =>
    plans.map((plan) => {
      if (plan.replaceChatId !== null) {
        // The replaced chat's history goes with it; this restore's own
        // import row is still in progress and stays.
        deleteChatRows(db, plan.replaceChatId);
      }
      const result = applyImportCommit(db, plan.commit, now);
      restoreSelf(db, result.chatId, plan.selfName);
      const bookmarksRestored = restoreBookmarks(db, result.chatId, plan.bookmarks);
      return { ...result, action: plan.action, bookmarksRestored };
    }),
  );
}
