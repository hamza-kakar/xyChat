/**
 * Bookmark statements. A bookmark always
 * belongs to the chat of its message: the insert selects the message by id
 * AND chat, so a mismatched pair stores nothing.
 */
import type { ChatId } from '../../core/ids';
import { bookmarkFromRow, messageFromRow } from './rows';
import type { SqliteDatabase } from './open';
import type { BookmarkView } from '../repository';

/** App-clock bookkeeping stamp, second precision (ISO-8601 UTC). */
function nowStamp(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/u, 'Z');
}

/**
 * Bookmarks a message, or replaces the note of its existing bookmark
 * (one bookmark per message, `UNIQUE (message_id)`).
 *
 * @param db Open database.
 * @param input Chat, message rowid and optional note.
 * @returns The bookmark id, or null when the message is not in that chat.
 */
export function addBookmark(
  db: SqliteDatabase,
  input: { readonly chatId: ChatId; readonly messageId: number; readonly note: string | null },
): string | null {
  db.run(
    `INSERT INTO bookmarks (id, chat_id, message_id, note, created_at)
     SELECT ?, chat_id, id, ?, ? FROM messages WHERE id = ? AND chat_id = ?
     ON CONFLICT (message_id) DO UPDATE SET note = excluded.note`,
    [crypto.randomUUID(), input.note, nowStamp(), input.messageId, input.chatId],
  );
  const rows = db.selectObjects('SELECT id FROM bookmarks WHERE message_id = ? AND chat_id = ?', [
    input.messageId,
    input.chatId,
  ]);
  const id = rows[0]?.['id'];
  return typeof id === 'string' ? id : null;
}

/**
 * Bookmarks of one chat (or of every chat when null), newest first, each
 * joined with its message and author name in one statement.
 *
 * @param db Open database.
 * @param chatId Chat to list, or null for all chats.
 * @returns Bookmark views for the bookmarks screen.
 */
export function listBookmarks(db: SqliteDatabase, chatId: ChatId | null): readonly BookmarkView[] {
  const rows = db.selectObjects(
    `SELECT b.id AS b_id, b.chat_id AS b_chat_id, b.message_id AS b_message_id,
            b.note AS b_note, b.created_at AS b_created_at,
            m.*, p.display_name AS author_name
     FROM bookmarks b
     JOIN messages m ON m.id = b.message_id
     LEFT JOIN participants p ON p.id = m.author_id
     WHERE ? IS NULL OR b.chat_id = ?
     ORDER BY b.created_at DESC, b.id DESC`,
    [chatId, chatId],
  );
  return rows.map((row) => ({
    bookmark: bookmarkFromRow({
      id: row['b_id'],
      chat_id: row['b_chat_id'],
      message_id: row['b_message_id'],
      note: row['b_note'],
      created_at: row['b_created_at'],
    }),
    message: messageFromRow(row),
  }));
}
