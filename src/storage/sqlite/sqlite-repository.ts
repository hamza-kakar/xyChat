/**
 * SQLite-backed ChatRepository (AGENTS.md §10.5): the ONLY place SQL lives.
 * Parameterized statements exclusively; every row passes through rows.ts
 * validation. Runs inside db.worker — never on the main thread.
 */
import type { ChatId, ParticipantId } from '../../core/ids';
import { formatLocalDateTime } from './local-date-time-parse';
import { attachmentFromRow, bookmarkFromRow, chatFromRow, chatSummaryFromRow, importFromRow, messageFromRow, participantFromRow } from './rows';
import type { SqliteDatabase } from './open';
import { listLinks, searchMessages } from './search-queries';
import type {
  Attachment,
  AttachmentPage,
  Bookmark,
  BookmarkView,
  Chat,
  ChatStats,
  ChatSummary,
  ImportRecord,
  LinkPage,
  Message,
  MessageWindow,
  SearchPage,
  SearchQuery,
  StorageUsage,
} from '../repository';

/** Reads an attachment row set for the given message ids. */
function attachmentsForMessages(
  db: SqliteDatabase,
  rowIds: readonly number[],
): Map<number, Attachment[]> {
  const byMessage = new Map<number, Attachment[]>();
  for (const rowId of rowIds) {
    const rows = db.selectObjects(
      'SELECT * FROM attachments WHERE message_id = ? ORDER BY id',
      [rowId],
    );
    const list = rows.map(attachmentFromRow);
    if (list.length > 0) {
      byMessage.set(rowId, list);
    }
  }
  return byMessage;
}

/** The repository facade bound to one open SqliteDatabase. */
export class SqliteChatRepository {
  private readonly db: SqliteDatabase;

  constructor(db: SqliteDatabase) {
    this.db = db;
  }

  /** Raw access for import-commit (same worker, same file). */
  get database(): SqliteDatabase {
    return this.db;
  }

  /** Chat-list rows sorted by recency (§12.4). */
  listChats(): readonly ChatSummary[] {
    return this.db
      .selectObjects(
        'SELECT id, title, is_group, message_count, last_ts_key, last_message_preview FROM chats ORDER BY last_ts_key DESC',
      )
      .map(chatSummaryFromRow);
  }

  /** One full chat, or null. */
  getChat(id: ChatId): Chat | null {
    const rows = this.db.selectObjects('SELECT * FROM chats WHERE id = ?', [id]);
    const first = rows[0];
    return first === undefined ? null : chatFromRow(first);
  }

  /** Participants of a chat, most-messages first. */
  getParticipants(chatId: ChatId): readonly Participant[] {
    return this.db
      .selectObjects(
        'SELECT * FROM participants WHERE chat_id = ? ORDER BY message_count DESC, display_name',
        [chatId],
      )
      .map(participantFromRow);
  }

  /** A window of messages around an anchor seq (§12.5). */
  getMessageWindow(q: {
    chatId: ChatId;
    anchorSeq: number;
    before: number;
    after: number;
  }): MessageWindow {
    const rows = this.db.selectObjects(
      `SELECT m.*, p.display_name AS author_name
       FROM messages m LEFT JOIN participants p ON p.id = m.author_id
       WHERE m.chat_id = ? AND m.seq BETWEEN ? AND ?
       ORDER BY m.seq`,
      [q.chatId, q.anchorSeq - q.before, q.anchorSeq + q.after],
    );
    const messages = rows.map(messageFromRow);
    const attachments = attachmentsForMessages(this.db, messages.map((m) => m.rowId));
    const minSeq = this.db.selectObjects('SELECT MIN(seq) AS s FROM messages WHERE chat_id = ?', [q.chatId]);
    const maxSeq = this.db.selectObjects('SELECT MAX(seq) AS s FROM messages WHERE chat_id = ?', [q.chatId]);
    const hasBefore = Number(minSeq[0]?.['s'] ?? 0) < q.anchorSeq - q.before;
    const hasAfter = Number(maxSeq[0]?.['s'] ?? 0) > q.anchorSeq + q.after;
    return {
      messages: messages.map((m) => ({ ...m, attachments: attachments.get(m.rowId) ?? [] })),
      hasBefore,
      hasAfter,
    };
  }

  /** First seq at/after the given wall-clock ts_key (§12.5 jump-to-date). */
  findSeqByDate(chatId: ChatId, tsKey: number): number | null {
    const rows = this.db.selectObjects(
      'SELECT seq FROM messages WHERE chat_id = ? AND ts_key >= ? ORDER BY seq LIMIT 1',
      [chatId, tsKey],
    );
    const first = rows[0];
    return typeof first?.['seq'] === 'number' ? first['seq'] : null;
  }

  /** Full-text or LIKE search with filters and keyset paging (§11). */
  search(q: SearchQuery): SearchPage {
    return searchMessages(this.db, q);
  }

  /** Links page: URLs extracted at import into text bodies (§12.6). */
  listLinks(q: { chatId: ChatId; cursor: number | null; limit: number }): LinkPage {
    return listLinks(this.db, q);
  }

  /** Attachment-gallery page for one chat and media types (§12.6). */
  listAttachments(q: {
    chatId: ChatId;
    types: readonly string[];
    cursor: number | null;
    limit: number;
  }): AttachmentPage {
    const conditions: string[] = ['chat_id = ?', `media_type IN (${q.types.map(() => '?').join(',')})`];
    const params: (string | number | null)[] = [q.chatId, ...q.types];
    if (q.cursor !== null) {
      conditions.push('id < ?');
      params.push(q.cursor);
    }
    const rows = this.db.selectObjects(
      `SELECT * FROM attachments WHERE ${conditions.join(' AND ')} ORDER BY id DESC LIMIT ?`,
      [...params, q.limit],
    );
    const attachments = rows.map(attachmentFromRow);
    const last = attachments.at(-1);
    return { attachments, nextCursor: rows.length === q.limit && last !== undefined ? last.id : null };
  }

  /** Chat-info statistics (§12.7). */
  getChatStats(chatId: ChatId): ChatStats {
    const kindRows = this.db.selectObjects(
      'SELECT kind, COUNT(*) AS n FROM messages WHERE chat_id = ? GROUP BY kind',
      [chatId],
    );
    const mediaRows = this.db.selectObjects(
      `SELECT media_type, COUNT(*) AS n, COALESCE(SUM(byte_size), 0) AS bytes
       FROM attachments WHERE chat_id = ? GROUP BY media_type`,
      [chatId],
    );
    const range = this.db.selectObjects(
      'SELECT MIN(ts_local) AS first, MAX(ts_local) AS last FROM messages WHERE chat_id = ?',
      [chatId],
    );
    const totalsByKind: Record<string, number> = {};
    for (const row of kindRows) {
      totalsByKind[String(row['kind'])] = Number(row['n']);
    }
    const mediaCounts: Record<string, number> = {};
    let mediaBytes = 0;
    for (const row of mediaRows) {
      mediaCounts[String(row['media_type'])] = Number(row['n']);
      mediaBytes += Number(row['bytes']);
    }
    const first = range[0]?.['first'];
    const last = range[0]?.['last'];
    return {
      totalsByKind: totalsByKind as ChatStats['totalsByKind'],
      mediaCounts: mediaCounts as ChatStats['mediaCounts'],
      mediaBytes,
      dateRange:
        typeof first === 'string' && typeof last === 'string'
          ? { first: messageFromRow({ ts_local: first, kind: 'text' }).tsLocal, last: messageFromRow({ ts_local: last, kind: 'text' }).tsLocal }
          : null,
    };
  }

  /** Sets (or clears) the "me" participant (§12.5). */
  setSelf(chatId: ChatId, participantId: ParticipantId | null): void {
    this.db.run('UPDATE chats SET self_participant_id = ?, updated_at = ? WHERE id = ?', [
      participantId,
      new Date().toISOString().replace(/\.\d{3}Z$/u, 'Z'),
      chatId,
    ]);
  }

  /** Renames a chat (§12.4). */
  renameChat(chatId: ChatId, title: string): void {
    this.db.run('UPDATE chats SET title = ?, updated_at = ? WHERE id = ?', [
      title,
      new Date().toISOString().replace(/\.\d{3}Z$/u, 'Z'),
      chatId,
    ]);
  }

  /** Deletes a chat; OPFS media deletion is the caller's follow-up (§10.4). */
  deleteChat(chatId: ChatId): void {
    this.db.transaction(() => {
      this.db.run('DELETE FROM bookmarks WHERE chat_id = ?', [chatId]);
      this.db.run('DELETE FROM attachments WHERE chat_id = ?', [chatId]);
      this.db.run('DELETE FROM messages WHERE chat_id = ?', [chatId]);
      this.db.run('DELETE FROM participants WHERE chat_id = ?', [chatId]);
      this.db.run('DELETE FROM chats WHERE id = ?', [chatId]);
    });
  }

  /** Adds a bookmark. */
  addBookmark(chatId: ChatId, messageId: number, note: string | null): string {
    const id = crypto.randomUUID();
    this.db.run('INSERT INTO bookmarks (id, chat_id, message_id, note, created_at) VALUES (?, ?, ?, ?, ?)', [
      id,
      chatId,
      messageId,
      note,
      new Date().toISOString().replace(/\.\d{3}Z$/u, 'Z'),
    ]);
    return id;
  }

  /** Updates a bookmark note. */
  updateBookmark(id: string, note: string | null): void {
    this.db.run('UPDATE bookmarks SET note = ? WHERE id = ?', [note, id]);
  }

  /** Removes a bookmark. */
  removeBookmark(id: string): void {
    this.db.run('DELETE FROM bookmarks WHERE id = ?', [id]);
  }

  /** Bookmarks for one chat, or all chats when null. */
  listBookmarks(chatId: ChatId | null): readonly BookmarkView[] {
    const rows =
      chatId === null
        ? this.db.selectObjects('SELECT * FROM bookmarks ORDER BY created_at DESC')
        : this.db.selectObjects('SELECT * FROM bookmarks WHERE chat_id = ? ORDER BY created_at DESC', [chatId]);
    return rows.map((row) => {
      const bookmark: Bookmark = bookmarkFromRow(row);
      const messageRows = this.db.selectObjects(
        `SELECT m.*, p.display_name AS author_name
         FROM messages m LEFT JOIN participants p ON p.id = m.author_id
         WHERE m.id = ?`,
        [bookmark.messageId],
      );
      const first = messageRows[0];
      return { bookmark, message: messageFromRow(first ?? {}) };
    });
  }

  /** Import history for one chat. */
  listImports(chatId: ChatId): readonly ImportRecord[] {
    return this.db
      .selectObjects('SELECT * FROM imports WHERE chat_id = ? ORDER BY started_at DESC', [chatId])
      .map(importFromRow);
  }

  /** Storage usage totals (§12.9): media bytes per chat. */
  storageUsage(): StorageUsage {
    const rows = this.db.selectObjects(
      'SELECT chat_id, COALESCE(SUM(COALESCE(byte_size, 0)), 0) AS bytes FROM attachments GROUP BY chat_id',
    );
    const perChat = rows.map((row) => ({
      chatId: row['chat_id'] as StorageUsage['perChat'][number]['chatId'],
      bytes: Number(row['bytes']),
    }));
    return { totalBytes: perChat.reduce((sum, c) => sum + c.bytes, 0), perChat };
  }

  /** Finds an existing chat id by exact title (import target §12.8). */
  findChatIdByTitle(title: string): ChatId | null {
    const rows = this.db.selectObjects('SELECT id FROM chats WHERE title = ? LIMIT 1', [title]);
    const first = rows[0];
    return first === undefined ? null : (first['id'] as ChatId);
  }

  /** Marks all in_progress imports rolled_back at boot (§9.3). */
  rollbackInProgressImports(): readonly string[] {
    const rows = this.db.selectObjects(
      "SELECT id, written_paths_json FROM imports WHERE status = 'in_progress'",
    );
    const paths: string[] = [];
    for (const row of rows) {
      const written: unknown = JSON.parse(String(row['written_paths_json'] ?? '[]'));
      if (Array.isArray(written)) {
        paths.push(...written.filter((p): p is string => typeof p === 'string'));
      }
      this.db.run("UPDATE imports SET status = 'rolled_back', finished_at = ? WHERE id = ?", [
        new Date().toISOString().replace(/\.\d{3}Z$/u, 'Z'),
        String(row['id']),
      ]);
    }
    return paths;
  }

  /** Formats a message timestamp for storage (canonical wall clock). */
  static formatTsLocal = formatLocalDateTime;
}
