/**
 * Chat row deletion (AGENTS.md §10.4): removes a chat and everything that
 * hangs off it. Runs inside the caller's transaction — deleting a chat and
 * replacing one from a backup (§10.6) share it.
 */
import type { SqliteDatabase } from './db-wrapper';

/**
 * Deletes one chat's rows (bookmarks, attachments, messages, participants,
 * its finished import history, the chat). An import still in progress
 * keeps its row for the §9.3 rollback. Media files are the caller's job,
 * after the commit.
 *
 * @param db The open database, inside a transaction.
 * @param chatId The chat to delete.
 */
export function deleteChatRows(db: SqliteDatabase, chatId: string): void {
  db.run('DELETE FROM bookmarks WHERE chat_id = ?', [chatId]);
  db.run('DELETE FROM attachments WHERE chat_id = ?', [chatId]);
  db.run('DELETE FROM messages WHERE chat_id = ?', [chatId]);
  db.run('DELETE FROM participants WHERE chat_id = ?', [chatId]);
  db.run("DELETE FROM imports WHERE chat_id = ? AND status <> 'in_progress'", [chatId]);
  db.run('DELETE FROM chats WHERE id = ?', [chatId]);
}
