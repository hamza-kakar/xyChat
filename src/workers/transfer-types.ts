/**
 * Backup and restore API types (AGENTS.md §10.6): requests, results and
 * typed errors shared by the db.worker API and the runs. Types only, so
 * the client can import them without the worker's OPFS modules (§3.1).
 */
import type { BackupArchiveErrorCode } from './backup-archive';
import type { BackupReadErrorCode } from '../storage/sqlite/backup-read';
import type { RestoreAction } from '../storage/sqlite/restore-commit';

/** What to back up. */
export interface BackupRequest {
  /** Chats to include; null for all of them. */
  readonly chatIds: readonly string[] | null;
  readonly includeMedia: boolean;
  /** The app's name and version, recorded in the manifest. */
  readonly appName: string;
  readonly appVersion: string;
}

/** Why a backup was not made. */
export type BackupErrorCode = 'NO_CHATS' | 'CANCELLED' | 'QUOTA' | 'IO';

/** A typed backup failure. */
export interface BackupError {
  readonly code: BackupErrorCode;
}

/** A finished backup archive in OPFS. */
export interface BackupResult {
  readonly path: string;
  readonly fileName: string;
  readonly bytes: number;
  readonly chatCount: number;
  readonly mediaFiles: number;
  readonly mediaMissing: number;
}

/** Why a restore could not go ahead. */
export type RestoreErrorCode =
  | BackupArchiveErrorCode
  | BackupReadErrorCode
  | 'QUOTA_EXCEEDED'
  | 'IO'
  | 'CANCELLED'
  | 'NOTHING_TO_RESTORE'
  | 'TARGET_NOT_FOUND';

/** A typed restore failure (codes only, §15.4). */
export interface RestoreError {
  readonly code: RestoreErrorCode;
}

/** A local chat a backup chat matches. */
export interface RestoreMatch {
  readonly chatId: string;
  readonly title: string;
}

/** One backup chat in the preview. */
export interface RestorePreviewChat {
  readonly backupChatId: string;
  readonly title: string;
  readonly isGroup: boolean;
  readonly messageCount: number;
  readonly mediaCount: number;
  readonly firstTsKey: number | null;
  readonly lastTsKey: number | null;
  /** The local chat with the same id, else the same title; null for none. */
  readonly match: RestoreMatch | null;
}

/** The restore preview (§10.6). */
export interface RestorePreview {
  readonly createdAt: string;
  readonly appVersion: string;
  readonly includesMedia: boolean;
  readonly chats: readonly RestorePreviewChat[];
}

/** The user's choice for one backup chat. */
export interface RestoreDecision {
  readonly backupChatId: string;
  readonly choice: 'skip' | RestoreAction;
  /** The local chat to merge into or replace; null otherwise. */
  readonly targetChatId: string | null;
}

/** What happened to one restored chat. */
export interface RestoreChatReport {
  readonly chatId: string;
  readonly title: string;
  readonly action: RestoreAction;
  readonly messagesAdded: number;
  readonly duplicatesSkipped: number;
  readonly mediaRestored: number;
  readonly mediaMissing: number;
  readonly bookmarksRestored: number;
}

/** A restore request: the file again, its name, and the choices. */
export interface RestoreRequest {
  readonly file: Blob;
  readonly fileName: string;
  readonly decisions: readonly RestoreDecision[];
}
