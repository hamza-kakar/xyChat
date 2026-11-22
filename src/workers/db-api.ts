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
  InChatSearchQuery,
  LinkPage,
  MatchingSeqs,
  MessageWindow,
  SearchPage,
  SearchQuery,
  StorageUsage,
  Participant,
  ChatPosition,
} from '../storage/repository';
import type { ImportCommitInput, ImportCommitResult } from '../storage/sqlite/import-commit';
import type { ImportRecordInput } from '../storage/sqlite/import-record';
import type { LockState, PinCheck } from '../storage/sqlite/app-lock-store';
import type { PersistedLogEntry } from '../storage/sqlite/persisted-logs';
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
  /** Every matching seq of an in-chat search, ascending (§11). */
  listMatchingSeqs(q: InChatSearchQuery): Promise<MatchingSeqs>;
  /** Calendar days with messages, as day numbers (§12.5 jump to date). */
  listMessageDays(chatId: ChatId): Promise<readonly number[]>;
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
  /** Bookmarks a message (or replaces its note); null when the message
   * is not in that chat. */
  addBookmark(chatId: ChatId, messageId: number, note: string | null): Promise<string | null>;
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
  /** Marks a failed import (§9.3). */
  markImportFailed(importId: string): Promise<void>;
  /** Fingerprints whose media the stored chat already holds (§9.2 step 8:
   * the media phase skips rewriting them). */
  listStoredFingerprints(chatId: string): Promise<readonly string[]>;
  /** §9.3 orphan sweep, list half: OPFS paths no attachment row references. */
  listOrphanMedia(): Promise<readonly string[]>;
  /** §9.3 orphan sweep, delete half: removes the given OPFS paths. */
  deleteOrphanMedia(paths: readonly string[]): Promise<number>;
  /** Takes the db-side end of the commit MessageChannel (§3.2);
   * transferred by the caller. */
  connectCommitPort(port: MessagePort): void;
  /** Raw attachment rows for a message (media viewer, §12.5). */
  getAttachmentsForMessage(messageId: number): Promise<readonly Attachment[]>;
  /** The last opened chat and its top-visible seq (§12.5), or null. */
  getLastChatPosition(): Promise<ChatPosition | null>;
  /** Remembers the last opened chat's position (§12.5). */
  setLastChatPosition(chatId: ChatId, seq: number): Promise<void>;
  /** Display name from a message's stored `.vcf` (§12.5), or null. */
  readContactName(messageId: number): Promise<string | null>;
  /** Stores an audio duration measured on first play (§13.2). */
  setAttachmentDuration(input: { attachmentId: string; durationMs: number }): Promise<void>;
  /** Saves a video thumbnail made on the main thread (§13.3) and records
   * it; resolves to its OPFS path, or null when the video row is gone.
   * The JPEG buffer is transferred. */
  saveVideoThumbnail(input: {
    attachmentId: string;
    jpeg: Uint8Array;
    width: number;
    height: number;
  }): Promise<string | null>;
  /** Schema version of the open database (§12.9 diagnostics). */
  getSchemaVersion(): Promise<number>;
  /** App-lock state (§15.3): PIN set, auto-lock delay, active lockout. */
  getLockState(): Promise<LockState>;
  /** Checks a PIN, counting failures (§15.3). */
  verifyPin(pin: string): Promise<PinCheck>;
  /** Sets, changes or removes the PIN; `current` must match a set PIN. */
  changePin(input: { current: string | null; next: string | null }): Promise<PinCheck>;
  /** Stores the auto-lock delay in minutes (0 = immediately). */
  setAutoLock(minutes: number): Promise<void>;
  /** The persisted warn/error log entries, oldest first (§18.7). */
  listPersistedLogs(): Promise<readonly PersistedLogEntry[]>;
  /** Replaces the persisted log entries (empty clears them). */
  savePersistedLogs(entries: readonly PersistedLogEntry[]): Promise<void>;
}
