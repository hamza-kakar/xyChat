/**
 * db.worker's Comlink API surface: the ONLY channel the
 * main thread may use for storage. Every method is wrapped by the worker
 * and serializes unexpected exceptions to `{ code: 'INTERNAL', id }`. This interface is imported TYPE-ONLY by the client.
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
import type { Result } from '../core/result';
import type {
  BackupError,
  BackupRequest,
  BackupResult,
  RestoreChatReport,
  RestoreError,
  RestorePreview,
  RestoreRequest,
} from './transfer-types';
import type { TransferHooks } from './transfer-hooks';
import type { LocalDateTime } from '../core/model';

/** A serialized worker error. The stack rides in the caller-side
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
  /** Every matching seq of an in-chat search, ascending. */
  listMatchingSeqs(q: InChatSearchQuery): Promise<MatchingSeqs>;
  /** Calendar days with messages, as day numbers (jump to date). */
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
  /** Deletes a chat; returns the OPFS paths to remove. */
  deleteChat(chatId: ChatId): Promise<readonly string[]>;
  /** Bookmarks a message (or replaces its note); null when the message
   * is not in that chat. */
  addBookmark(chatId: ChatId, messageId: number, note: string | null): Promise<string | null>;
  updateBookmark(id: string, note: string | null): Promise<void>;
  removeBookmark(id: string): Promise<void>;
  listBookmarks(chatId: ChatId | null): Promise<readonly BookmarkView[]>;
  listImports(chatId: ChatId): Promise<readonly ImportRecord[]>;
  storageUsage(): Promise<StorageUsage>;
  /** Creates the in_progress import row (before media writes). */
  createImportRecord(input: ImportRecordInput): Promise<void>;
  /** Transactional import commit. */
  commitImport(input: ImportCommitInput): Promise<ImportCommitResult>;
  /** Registers OPFS paths against the import row for crash rollback. */
  recordWrittenPaths(importId: string, paths: readonly string[]): Promise<void>;
  /** Boot-time rollback of in_progress imports; returns OPFS paths to delete. */
  rollbackInProgressImports(): Promise<readonly string[]>;
  /** Marks a cancelled import (user cancel after media rollback). */
  markImportCancelled(importId: string): Promise<void>;
  /** Marks a failed import. */
  markImportFailed(importId: string): Promise<void>;
  /** Fingerprints whose media the stored chat already holds (the media phase skips rewriting them). */
  listStoredFingerprints(chatId: string): Promise<readonly string[]>;
  /**  orphan sweep, list half: OPFS paths no attachment row references. */
  listOrphanMedia(): Promise<readonly string[]>;
  /**  orphan sweep, delete half: removes the given OPFS paths. */
  deleteOrphanMedia(paths: readonly string[]): Promise<number>;
  /** Takes the db-side end of the commit MessageChannel;
   * transferred by the caller. */
  connectCommitPort(port: MessagePort): void;
  /** Raw attachment rows for a message (media viewer). */
  getAttachmentsForMessage(messageId: number): Promise<readonly Attachment[]>;
  /** The last opened chat and its top-visible seq, or null. */
  getLastChatPosition(): Promise<ChatPosition | null>;
  /** Remembers the last opened chat's position. */
  setLastChatPosition(chatId: ChatId, seq: number): Promise<void>;
  /** Display name from a message's stored `.vcf`, or null. */
  readContactName(messageId: number): Promise<string | null>;
  /** Stores an audio duration measured on first play. */
  setAttachmentDuration(input: { attachmentId: string; durationMs: number }): Promise<void>;
  /** Saves a video thumbnail made on the main thread and records
   * it; resolves to its OPFS path, or null when the video row is gone.
   * The JPEG buffer is transferred. */
  saveVideoThumbnail(input: {
    attachmentId: string;
    jpeg: Uint8Array;
    width: number;
    height: number;
  }): Promise<string | null>;
  /** Schema version of the open database (diagnostics). */
  getSchemaVersion(): Promise<number>;
  /** App-lock state: PIN set, auto-lock delay, active lockout. */
  getLockState(): Promise<LockState>;
  /** Checks a PIN, counting failures. */
  verifyPin(pin: string): Promise<PinCheck>;
  /** Sets, changes or removes the PIN; `current` must match a set PIN. */
  changePin(input: { current: string | null; next: string | null }): Promise<PinCheck>;
  /** Stores the auto-lock delay in minutes (0 = immediately). */
  setAutoLock(minutes: number): Promise<void>;
  /** The persisted warn/error log entries, oldest first. */
  listPersistedLogs(): Promise<readonly PersistedLogEntry[]>;
  /** Replaces the persisted log entries (empty clears them). */
  savePersistedLogs(entries: readonly PersistedLogEntry[]): Promise<void>;
  /** Estimated backup size in bytes (shown before making it). */
  estimateBackup(selection: {
    chatIds: readonly string[] | null;
    includeMedia: boolean;
  }): Promise<number>;
  /** Makes a backup archive in `backup-tmp/`; hooks are proxied. */
  createBackup(
    request: BackupRequest,
    hooks: TransferHooks,
  ): Promise<Result<BackupResult, BackupError>>;
  /** Removes finished backup archives from `backup-tmp/`. */
  clearBackupFiles(): Promise<void>;
  /** Validates a backup and previews its chats. */
  inspectBackup(file: Blob): Promise<Result<RestorePreview, RestoreError>>;
  /** Restores the chosen chats of a backup; hooks are proxied. */
  restoreBackup(
    request: RestoreRequest,
    hooks: TransferHooks,
  ): Promise<Result<readonly RestoreChatReport[], RestoreError>>;
}
