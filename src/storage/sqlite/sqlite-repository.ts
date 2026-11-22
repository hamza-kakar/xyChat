/**
 * SQLite-backed ChatRepository (AGENTS.md §10.5): the ONLY place SQL lives.
 * Parameterized statements exclusively; every row passes through rows.ts
 * validation. Runs inside db.worker — never on the main thread.
 */
import type { ChatId, ParticipantId } from '../../core/ids';
import { formatLocalDateTime, parseLocalDateTime } from './local-date-time-parse';
import { tsLocalToKey } from './ts-key';
import type { LocalDateTime } from '../../core/model';
import {
  attachmentFromRow,
  chatFromRow,
  chatSummaryFromRow,
  importFromRow,
  messageFromRow,
  parseWrittenPaths,
  participantFromRow,
} from './rows';
import type { SqliteDatabase } from './open';
import {
  getAttachmentsForMessage,
  listChatMediaPaths,
  listOrphanMedia,
  listStoredFingerprints,
  markImportCancelled,
  markImportFailed,
  recordWrittenPaths,
} from './import-admin';
import { listLinks, listMatchingSeqs, searchMessages } from './search-queries';
import { addBookmark, listBookmarks } from './bookmark-queries';
import { listMessageDays } from './day-queries';
import type { Participant } from '../repository';
import type {
  Attachment,
  AttachmentPage,
  BookmarkView,
  Chat,
  ChatStats,
  ChatSummary,
  ImportRecord,
  InChatSearchQuery,
  LinkPage,
  MatchingSeqs,
  MessageWindow,
  SearchPage,
  SearchQuery,
  StorageUsage,
} from '../repository';

/** Reads the attachments of a chat's messages with seq in `lo..hi`, in ONE
 * statement (idx_attachments_message): per-message queries cost a VFS
 * round trip each, which dominated window reads on OPFS (§17). */
function attachmentsForSeqRange(
  db: SqliteDatabase,
  chatId: ChatId,
  range: { readonly lo: number; readonly hi: number },
): Map<number, Attachment[]> {
  const byMessage = new Map<number, Attachment[]>();
  const rows = db.selectObjects(
    `SELECT a.* FROM messages m JOIN attachments a ON a.message_id = m.id
     WHERE m.chat_id = ? AND m.seq BETWEEN ? AND ?
     ORDER BY a.message_id, a.id`,
    [chatId, range.lo, range.hi],
  );
  for (const attachment of rows.map(attachmentFromRow)) {
    const list = byMessage.get(attachment.messageId);
    if (list === undefined) {
      byMessage.set(attachment.messageId, [attachment]);
    } else {
      list.push(attachment);
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

  /** Chat-list rows sorted by recency (§12.4). The last message (by seq,
   * via the UNIQUE(chat_id, seq) index) supplies the preview's sender and
   * media-type label; no aggregate is computed here. */
  listChats(): readonly ChatSummary[] {
    return this.db
      .selectObjects(
        `SELECT c.id, c.title, c.is_group, c.message_count, c.last_ts_key, c.last_message_preview,
                m.kind AS last_kind, p.display_name AS last_author,
                (SELECT a.media_type FROM attachments a WHERE a.message_id = m.id LIMIT 1) AS last_media_type
         FROM chats c
         LEFT JOIN messages m
           ON m.chat_id = c.id AND m.seq = (SELECT MAX(seq) FROM messages WHERE chat_id = c.id)
         LEFT JOIN participants p ON p.id = m.author_id
         ORDER BY c.last_ts_key DESC`,
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

  /** A window of messages around an anchor seq (§12.5), read in one
   * transaction so the VFS lock is taken once. */
  getMessageWindow(q: {
    chatId: ChatId;
    anchorSeq: number;
    before: number;
    after: number;
  }): MessageWindow {
    const range = { lo: q.anchorSeq - q.before, hi: q.anchorSeq + q.after };
    return this.db.transaction(() => {
      const rows = this.db.selectObjects(
        `SELECT m.*, p.display_name AS author_name
         FROM messages m LEFT JOIN participants p ON p.id = m.author_id
         WHERE m.chat_id = ? AND m.seq BETWEEN ? AND ?
         ORDER BY m.seq`,
        [q.chatId, range.lo, range.hi],
      );
      const attachments = attachmentsForSeqRange(this.db, q.chatId, range);
      // Two statements: SQLite's min/max shortcut reads one index entry
      // each, where a combined MIN/MAX would scan the chat's whole range.
      const minSeq = this.db.selectObjects('SELECT MIN(seq) AS s FROM messages WHERE chat_id = ?', [
        q.chatId,
      ]);
      const maxSeq = this.db.selectObjects('SELECT MAX(seq) AS s FROM messages WHERE chat_id = ?', [
        q.chatId,
      ]);
      return {
        messages: rows
          .map(messageFromRow)
          .map((m) => ({ ...m, attachments: attachments.get(m.rowId) ?? [] })),
        hasBefore: Number(minSeq[0]?.['s'] ?? 0) < range.lo,
        hasAfter: Number(maxSeq[0]?.['s'] ?? 0) > range.hi,
      };
    });
  }

  /** First seq at/after the given date (§10.5, §12.5 jump-to-date). */
  findSeqByDate(chatId: ChatId, date: LocalDateTime): number | null {
    const tsKey = tsLocalToKey(date);
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

  /** Every matching seq of an in-chat search (§11 navigation). */
  listMatchingSeqs(q: InChatSearchQuery): MatchingSeqs {
    return listMatchingSeqs(this.db, q);
  }

  /** Calendar days with messages (§12.5 jump to date). */
  listMessageDays(chatId: ChatId): readonly number[] {
    return listMessageDays(this.db, chatId);
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
    const conditions: string[] = [
      'chat_id = ?',
      `media_type IN (${q.types.map(() => '?').join(',')})`,
    ];
    const params: (string | number | null)[] = [q.chatId, ...q.types];
    if (q.cursor !== null) {
      conditions.push('rowid < ?');
      params.push(q.cursor);
    }
    const rows = this.db.selectObjects(
      `SELECT rowid AS row_id, * FROM attachments WHERE ${conditions.join(' AND ')} ORDER BY rowid DESC LIMIT ?`,
      [...params, q.limit],
    );
    const attachments = rows.map(attachmentFromRow);
    const lastRowId = rows.at(-1)?.['row_id'];
    return {
      attachments,
      nextCursor: rows.length === q.limit && typeof lastRowId === 'number' ? lastRowId : null,
    };
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
          ? { first: parseLocalDateTime(first), last: parseLocalDateTime(last) }
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

  /** Bookmarks a message or replaces its note; null when the message is
   * not in that chat. */
  addBookmark(chatId: ChatId, messageId: number, note: string | null): string | null {
    return addBookmark(this.db, { chatId, messageId, note });
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
    return listBookmarks(this.db, chatId);
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
      const raw = row['written_paths_json'];
      paths.push(...parseWrittenPaths(typeof raw === 'string' ? raw : '[]'));
      this.db.run("UPDATE imports SET status = 'rolled_back', finished_at = ? WHERE id = ?", [
        new Date().toISOString().replace(/\.\d{3}Z$/u, 'Z'),
        String(row['id']),
      ]);
    }
    return paths;
  }

  /** Marks one import cancelled — applies only from in_progress (§9.3). */
  markImportCancelled(importId: string): void {
    markImportCancelled(this.db, importId);
  }

  /** Marks one import failed — applies only from in_progress (§9.3). */
  markImportFailed(importId: string): void {
    markImportFailed(this.db, importId);
  }

  /** Replaces the recorded written-path list for one import (§9.3
   * bookkeeping; the list is cumulative, §9.2 step 8). */
  recordWrittenPaths(importId: string, paths: readonly string[]): void {
    recordWrittenPaths(this.db, importId, paths);
  }

  /** Fingerprints whose media the stored chat already holds (§9.2 step 8:
   * the media phase skips rewriting them). */
  listStoredFingerprints(chatId: ChatId): readonly string[] {
    return listStoredFingerprints(this.db, chatId);
  }

  /** §9.3 orphan sweep, list half: OPFS media/thumbnail paths that no
   * attachment row references. The caller deletes after confirmation. */
  listOrphanMedia(fsPaths: readonly string[]): readonly string[] {
    return listOrphanMedia(this.db, fsPaths);
  }

  /** Raw attachment rows for one message (media viewer, §12.5). */
  getAttachmentsForMessage(messageId: number): readonly Attachment[] {
    return getAttachmentsForMessage(this.db, messageId);
  }

  /** Every stored file path of one chat, for removal after deleteChat. */
  listChatMediaPaths(chatId: ChatId): readonly string[] {
    return listChatMediaPaths(this.db, chatId);
  }

  /** Formats a message timestamp for storage (canonical wall clock). */
  static formatTsLocal = formatLocalDateTime;
}
