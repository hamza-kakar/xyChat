/**
 * Reading a backup's `db.sqlite3` (AGENTS.md §10.6, §18.5). The database
 * comes from a user-picked file, so it is untrusted: it opens as an
 * in-memory scratch copy, must pass `quick_check`, may not be newer than
 * the app, is migrated forward when older, and every row is validated
 * before it becomes restore input. Any mismatch is a typed error.
 */
import * as v from 'valibot';
import { err, ok, type Result } from '../../core/result';
import type { MediaType, ParsedMessage } from '../../core/model';
import { migrate } from './migrate';
import { readSchemaVersion } from './meta';
import { SCHEMA_VERSION } from './migrations';
import { parseLocalDateTime } from './local-date-time-parse';
import { tryCreateLocalDateTime } from '../../core/dates/local-date-time';
import type { ScratchDatabase, ScratchDatabases } from './scratch-db';
import type { InsertableMessage } from './import-commit';
import {
  AttachmentRow,
  BookmarkRow,
  ChatRow,
  LocationPayload,
  MessageRow,
  parseRows,
  PollPayload,
  PreviewRow,
  type BackupReadError,
} from './backup-rows';

export type { BackupReadError, BackupReadErrorCode } from './backup-rows';

/** One chat of a backup, for the restore preview (§10.6). */
export interface BackupChatPreview {
  readonly id: string;
  readonly title: string;
  readonly isGroup: boolean;
  readonly messageCount: number;
  readonly mediaCount: number;
  readonly firstTsKey: number | null;
  readonly lastTsKey: number | null;
}

/** One attachment of a backup chat; source paths name the zip entries. */
export interface BackupAttachment {
  readonly fingerprintOfMessage: string;
  readonly sourcePath: string | null;
  readonly sourceThumbPath: string | null;
  readonly fileName: string | null;
  readonly mediaType: MediaType;
  readonly mime: string | null;
  readonly byteSize: number | null;
  readonly width: number | null;
  readonly height: number | null;
  readonly durationMs: number | null;
  readonly status: 'present' | 'missing' | 'omitted';
}

/** A bookmark of a backup chat, keyed by its message's fingerprint. */
export interface BackupBookmark {
  readonly fingerprint: string;
  readonly note: string | null;
  readonly createdAt: string;
}

/** Everything a restore needs about one backup chat. */
export interface BackupChatContent {
  readonly title: string;
  readonly isGroup: boolean;
  readonly sourcePlatform: 'ios' | 'android' | 'unknown';
  readonly dateOrder: 'DMY' | 'MDY' | 'YMD';
  readonly selfName: string | null;
  /** Parser version of the chat's latest import, when recorded. */
  readonly parserVersion: string | null;
  readonly messages: readonly InsertableMessage[];
  readonly attachments: readonly BackupAttachment[];
  readonly bookmarks: readonly BackupBookmark[];
}

/** Tables a backup database must contain. */
const REQUIRED_TABLES = [
  'meta',
  'chats',
  'participants',
  'messages',
  'attachments',
  'bookmarks',
  'imports',
] as const;

/** True when every required table exists as a real table. */
function hasRequiredTables(db: ScratchDatabase): boolean {
  const names = new Set(
    db
      .selectArrays("SELECT name FROM sqlite_schema WHERE type = 'table'")
      .map((row) => String(row[0])),
  );
  return REQUIRED_TABLES.every((name) => names.has(name));
}

/**
 * Opens a backup database from its bytes.
 *
 * @param scratch Factory for in-memory databases.
 * @param bytes The `db.sqlite3` entry of the backup.
 * @returns The opened (and migrated) database — the caller closes it — or
 *   a typed failure.
 */
export function openBackupDatabase(
  scratch: ScratchDatabases,
  bytes: Uint8Array,
): Result<ScratchDatabase, BackupReadError> {
  let db: ScratchDatabase;
  try {
    db = scratch.fromBytes(bytes);
  } catch {
    return err({ code: 'CORRUPT_DATABASE', detail: 'not a database image' });
  }
  try {
    const check = db.selectArrays('PRAGMA quick_check')[0]?.[0];
    if (check !== 'ok' || !hasRequiredTables(db)) {
      db.close();
      return err({ code: 'CORRUPT_DATABASE', detail: 'integrity check failed' });
    }
    const version = readSchemaVersion(db);
    if (version > SCHEMA_VERSION) {
      db.close();
      return err({ code: 'SCHEMA_TOO_NEW', detail: `schema ${version}` });
    }
    migrate(db);
    return ok(db);
  } catch {
    db.close();
    return err({ code: 'CORRUPT_DATABASE', detail: 'unreadable database' });
  }
}

/**
 * Lists the chats of a backup with counts taken from the rows themselves.
 *
 * @param db An opened backup database.
 * @returns The preview rows, newest chat first, or a typed failure.
 */
export function listBackupChats(
  db: ScratchDatabase,
): Result<readonly BackupChatPreview[], BackupReadError> {
  const rows = parseRows(
    PreviewRow,
    db.selectObjects(
      `SELECT c.id, c.title, c.is_group,
         (SELECT COUNT(*) FROM messages m WHERE m.chat_id = c.id) AS message_count,
         (SELECT COUNT(*) FROM attachments a WHERE a.chat_id = c.id AND a.status = 'present')
           AS media_count,
         (SELECT MIN(ts_key) FROM messages m WHERE m.chat_id = c.id) AS first_ts_key,
         (SELECT MAX(ts_key) FROM messages m WHERE m.chat_id = c.id) AS last_ts_key
       FROM chats c ORDER BY last_ts_key DESC, c.id`,
    ),
    'chats',
  );
  if (!rows.ok) {
    return rows;
  }
  return ok(
    rows.value.map((row) => ({
      id: row.id,
      title: row.title,
      isGroup: row.is_group,
      messageCount: row.message_count,
      mediaCount: row.media_count,
      firstTsKey: row.first_ts_key,
      lastTsKey: row.last_ts_key,
    })),
  );
}

/** Parses an `extra_json` payload; an unreadable one is dropped, as on
 * normal reads. */
function parseExtra(raw: string | null): unknown {
  if (raw === null) {
    return null;
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

/** Builds the parsed-message form the import commit inserts; null when
 * the timestamp is out of range. */
function toInsertable(
  row: v.InferOutput<typeof MessageRow>,
  attachment: BackupAttachment | undefined,
): InsertableMessage | null {
  const timestamp = tryCreateLocalDateTime(parseLocalDateTime(row.ts_local));
  if (!timestamp.ok) {
    return null;
  }
  const extra = parseExtra(row.extra_json);
  const poll = row.kind === 'poll' ? v.safeParse(PollPayload, extra) : null;
  const location = row.kind === 'location' ? v.safeParse(LocationPayload, extra) : null;
  const message: ParsedMessage = {
    seq: row.seq,
    sourceLine: 0,
    timestamp: timestamp.value,
    author: row.author_name,
    kind: row.kind,
    body: row.body,
    isEdited: row.is_edited,
    attachment:
      attachment === undefined
        ? null
        : {
            fileName: attachment.fileName,
            mediaType: attachment.mediaType,
            status: attachment.status === 'omitted' ? 'omitted' : 'referenced',
          },
    poll: poll?.success === true ? poll.output : null,
    location: location?.success === true ? location.output : null,
  };
  return { fingerprint: row.fingerprint, message };
}

/** Reads and validates one chat's attachments. */
function readAttachments(
  db: ScratchDatabase,
  chatId: string,
): Result<BackupAttachment[], BackupReadError> {
  const rows = parseRows(
    AttachmentRow,
    db.selectObjects(
      `SELECT m.fingerprint, a.file_name, a.media_type, a.mime, a.byte_size, a.opfs_path,
         a.thumb_path, a.width, a.height, a.duration_ms, a.status
       FROM attachments a JOIN messages m ON m.id = a.message_id
       WHERE a.chat_id = ? AND m.chat_id = ? ORDER BY m.seq, a.id`,
      [chatId, chatId],
    ),
    'attachments',
  );
  if (!rows.ok) {
    return rows;
  }
  return ok(
    rows.value.map((row) => ({
      fingerprintOfMessage: row.fingerprint,
      sourcePath: row.status === 'present' ? row.opfs_path : null,
      sourceThumbPath: row.status === 'present' ? row.thumb_path : null,
      fileName: row.file_name,
      mediaType: row.media_type,
      mime: row.mime,
      byteSize: row.byte_size,
      width: row.width,
      height: row.height,
      durationMs: row.duration_ms,
      status: row.status,
    })),
  );
}

/** Reads and validates one chat's messages (in seq order). */
function readMessages(
  db: ScratchDatabase,
  chatId: string,
  attachments: readonly BackupAttachment[],
): Result<InsertableMessage[], BackupReadError> {
  const rows = parseRows(
    MessageRow,
    db.selectObjects(
      `SELECT m.fingerprint, m.seq, m.ts_local, p.display_name AS author_name, m.kind, m.body,
         m.is_edited, m.extra_json
       FROM messages m LEFT JOIN participants p ON p.id = m.author_id
       WHERE m.chat_id = ? ORDER BY m.seq`,
      [chatId],
    ),
    'messages',
  );
  if (!rows.ok) {
    return rows;
  }
  const byFingerprint = new Map(attachments.map((a) => [a.fingerprintOfMessage, a]));
  const messages: InsertableMessage[] = [];
  for (const row of rows.value) {
    const message = toInsertable(row, byFingerprint.get(row.fingerprint));
    if (message === null) {
      return err({ code: 'CORRUPT_DATABASE', detail: 'invalid messages row' });
    }
    messages.push(message);
  }
  return ok(messages);
}

/**
 * Reads one backup chat as restore input.
 *
 * @param db An opened backup database.
 * @param chatId A chat id from {@link listBackupChats}.
 * @returns The chat's metadata, messages, attachments and bookmarks, or a
 *   typed failure (also when the chat does not exist).
 */
export function readBackupChat(
  db: ScratchDatabase,
  chatId: string,
): Result<BackupChatContent, BackupReadError> {
  const chatRows = parseRows(
    ChatRow,
    db.selectObjects(
      `SELECT c.title, c.is_group, c.source_platform, c.date_order,
         (SELECT display_name FROM participants p WHERE p.id = c.self_participant_id
            AND p.chat_id = c.id) AS self_name,
         (SELECT parser_version FROM imports i WHERE i.chat_id = c.id AND i.status = 'complete'
            ORDER BY i.started_at DESC LIMIT 1) AS parser_version
       FROM chats c WHERE c.id = ?`,
      [chatId],
    ),
    'chats',
  );
  if (!chatRows.ok) {
    return chatRows;
  }
  const chat = chatRows.value[0];
  if (chat === undefined) {
    return err({ code: 'CORRUPT_DATABASE', detail: 'chat not in backup' });
  }
  const attachments = readAttachments(db, chatId);
  if (!attachments.ok) {
    return attachments;
  }
  const messages = readMessages(db, chatId, attachments.value);
  if (!messages.ok) {
    return messages;
  }
  const bookmarks = parseRows(
    BookmarkRow,
    db.selectObjects(
      `SELECT m.fingerprint, b.note, b.created_at FROM bookmarks b
       JOIN messages m ON m.id = b.message_id WHERE b.chat_id = ? AND m.chat_id = ?`,
      [chatId, chatId],
    ),
    'bookmarks',
  );
  if (!bookmarks.ok) {
    return bookmarks;
  }
  return ok({
    title: chat.title,
    isGroup: chat.is_group,
    sourcePlatform: chat.source_platform,
    dateOrder: chat.date_order,
    selfName: chat.self_name,
    parserVersion: chat.parser_version,
    messages: messages.value,
    attachments: attachments.value,
    bookmarks: bookmarks.value.map((row) => ({
      fingerprint: row.fingerprint,
      note: row.note,
      createdAt: row.created_at,
    })),
  });
}
