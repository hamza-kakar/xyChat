/**
 * db.worker's Comlink API surface (AGENTS.md §3.2): the ONLY channel the
 * main thread may use for storage. Every method is wrapped by the worker
 * and serializes unexpected exceptions to `{ code: 'INTERNAL', id }`
 * (§18.7). This interface is imported TYPE-ONLY by the client (§3.1).
 */
import type {
  Attachment,
  AttachmentPage,
  BookmarkView,
  Chat,
  ChatStats,
  ChatSummary,
  ImportRecord,
  LinkPage,
  MessageWindow,
  SearchPage,
  SearchQuery,
  StorageUsage,
  Participant,
} from '../storage/repository';
import type { ImportCommitInput, ImportCommitResult } from '../storage/sqlite/import-commit';
import type { ImportRecordInput } from '../storage/sqlite/import-record';
import type { ChatId, ParticipantId } from '../core/ids';
import type { LocalDateTime } from '../core/model';

/** A serialized worker error (§18.7). The stack rides in the caller-side
 * message (Comlink re-creates Errors with the message only); it contains
 * engine locations only — never message content. */
export interface WorkerError {
  readonly code: 'INTERNAL' | 'INVALID_INPUT';
  readonly message: string;
  /** Sanitized worker-side stack (diagnostics only; never user-facing). */
  readonly stack: string | null;
}

/** The db.worker API exposed over Comlink. */
export interface DbApi {
  /** Resolves once the DB is open, migrated and FTS5-verified. */
  ready(): Promise<{ ok: true } | { ok: false; error: WorkerError }>;
  listChats(): Promise<readonly ChatSummary[]>;
  getChat(id: ChatId): Promise<Chat | null>;
  getParticipants(chatId: ChatId): Promise<readonly Participant[]>;
  getMessageWindow(q: {
    chatId: ChatId;
    anchorSeq: number;
    before: number;
    after: number;
  }): Promise<MessageWindow>;
  findSeqByDate(chatId: ChatId, date: LocalDateTime): Promise<number | null>;
  search(q: SearchQuery): Promise<SearchPage>;
  listAttachments(q: {
    chatId: ChatId;
    types: readonly string[];
    cursor: number | null;
    limit: number;
  }): Promise<AttachmentPage>;
  listLinks(q: { chatId: ChatId; cursor: number | null; limit: number }): Promise<LinkPage>;
  getChatStats(chatId: ChatId): Promise<ChatStats>;
  setSelf(chatId: ChatId, participantId: ParticipantId | null): Promise<void>;
  renameChat(chatId: ChatId, title: string): Promise<void>;
  /** Deletes a chat; returns the OPFS paths to remove (§10.4). */
  deleteChat(chatId: ChatId): Promise<readonly string[]>;
  addBookmark(chatId: ChatId, messageId: number, note: string | null): Promise<string>;
  updateBookmark(id: string, note: string | null): Promise<void>;
  removeBookmark(id: string): Promise<void>;
  listBookmarks(chatId: ChatId | null): Promise<readonly BookmarkView[]>;
  listImports(chatId: ChatId): Promise<readonly ImportRecord[]>;
  storageUsage(): Promise<StorageUsage>;
  /** Creates the in_progress import row (§9.3: before media writes). */
  createImportRecord(input: ImportRecordInput): Promise<void>;
  /** Transactional import commit (§9.2 step 10). */
  commitImport(input: ImportCommitInput): Promise<ImportCommitResult>;
  /** Registers OPFS paths against the import row for crash rollback. */
  recordWrittenPaths(importId: string, paths: readonly string[]): Promise<void>;
  /** Boot-time rollback of in_progress imports (§9.3); returns OPFS paths to delete. */
  rollbackInProgressImports(): Promise<readonly string[]>;
  /** Marks a cancelled import (user cancel after media rollback, §9.3). */
  markImportCancelled(importId: string): Promise<void>;
  /** Marks a failed import (§9.3). The detail lives in the client-side
   * error and the logger — never in the import row (§18.7). */
  markImportFailed(importId: string): Promise<void>;
  /**
   * Takes one end of the commit MessageChannel (§3.2): import.worker sends
   * commit requests and written-path batches over the port; db.worker —
   * the ONLY SQLite owner (§3.2) — executes them. The port is transferred.
   */
  connectCommitPort(port: MessagePort): void;
  /** Raw attachment rows for a message (media viewer, §12.5). */
  getAttachmentsForMessage(messageId: number): Promise<readonly Attachment[]>;
}
