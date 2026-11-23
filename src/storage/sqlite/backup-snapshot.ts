/**
 * Backup snapshots (AGENTS.md §10.6): copies the chosen chats into a fresh
 * in-memory database at the current schema and serializes it as the
 * backup's `db.sqlite3`. The copy runs synchronously inside db.worker, so
 * no other statement interleaves and the snapshot is consistent.
 *
 * The snapshot carries chats, participants, completed imports, messages,
 * attachments and bookmarks. It leaves out app settings from `meta` (the
 * PIN hash, logs, view state) and the full-text index, which a restore
 * rebuilds as it inserts rows.
 */
import { migrate } from './migrate';
import { dropFtsTriggers, FTS_TRIGGER_DDL } from './fts-triggers';
import { readSchemaVersion } from './meta';
import type { SqliteDatabase } from './db-wrapper';
import type { ScratchDatabases } from './scratch-db';

/** Rows copied per batch for the large tables (bounded memory). */
const COPY_BATCH_ROWS = 5_000;

/** One chat as listed in the backup manifest. */
export interface BackupChatSummary {
  readonly id: string;
  readonly title: string;
  readonly messageCount: number;
  readonly mediaCount: number;
  readonly firstTsKey: number | null;
  readonly lastTsKey: number | null;
}

/** The serialized snapshot plus what the zip writer needs. */
export interface BackupSnapshot {
  readonly bytes: Uint8Array;
  readonly schemaVersion: number;
  readonly chats: readonly BackupChatSummary[];
  /** OPFS paths of stored media and thumbnails of the copied chats. */
  readonly mediaPaths: readonly string[];
}

/** A table copy: the select over the app database and the insert into the
 * snapshot, with matching column order. Constant SQL only. */
interface TableCopy {
  readonly select: string;
  readonly insert: string;
  /** True when `select` takes a keyset cursor and a limit (large tables);
   * its first column is the cursor. */
  readonly batched: boolean;
  /** True when the cursor column is not part of the insert. */
  readonly cursorOnly: boolean;
}

const CHAT_COPY: TableCopy = {
  select: `SELECT id, title, is_group, self_participant_id, source_platform, date_order,
      message_count, media_count, media_bytes, first_ts_key, last_ts_key,
      last_message_preview, created_at, updated_at FROM chats WHERE id = ?`,
  insert: `INSERT INTO chats (id, title, is_group, self_participant_id, source_platform,
      date_order, message_count, media_count, media_bytes, first_ts_key, last_ts_key,
      last_message_preview, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  batched: false,
  cursorOnly: false,
};

const IMPORT_COPY: TableCopy = {
  select: `SELECT id, chat_id, file_name, file_bytes, status, parser_version, started_at,
      finished_at, report_json FROM imports WHERE chat_id = ? AND status = 'complete'`,
  insert: `INSERT INTO imports (id, chat_id, file_name, file_bytes, status, parser_version,
      started_at, finished_at, report_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  batched: false,
  cursorOnly: false,
};

const PARTICIPANT_COPY: TableCopy = {
  select:
    'SELECT id, chat_id, display_name, color_index, message_count FROM participants WHERE chat_id = ?',
  insert:
    'INSERT INTO participants (id, chat_id, display_name, color_index, message_count) VALUES (?, ?, ?, ?, ?)',
  batched: false,
  cursorOnly: false,
};

const MESSAGE_COPY: TableCopy = {
  select: `SELECT id, chat_id, fingerprint, seq, ts_local, ts_key, author_id, kind, body,
      is_edited, extra_json, import_id FROM messages
    WHERE chat_id = ? AND id > ? ORDER BY id LIMIT ?`,
  insert: `INSERT INTO messages (id, chat_id, fingerprint, seq, ts_local, ts_key, author_id,
      kind, body, is_edited, extra_json, import_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  batched: true,
  cursorOnly: false,
};

const ATTACHMENT_COPY: TableCopy = {
  select: `SELECT rowid, id, message_id, chat_id, file_name, media_type, mime, byte_size,
      opfs_path, thumb_path, width, height, duration_ms, status FROM attachments
    WHERE chat_id = ? AND rowid > ? ORDER BY rowid LIMIT ?`,
  insert: `INSERT INTO attachments (id, message_id, chat_id, file_name, media_type, mime,
      byte_size, opfs_path, thumb_path, width, height, duration_ms, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  batched: true,
  cursorOnly: true,
};

const BOOKMARK_COPY: TableCopy = {
  select: 'SELECT id, chat_id, message_id, note, created_at FROM bookmarks WHERE chat_id = ?',
  insert:
    'INSERT INTO bookmarks (id, chat_id, message_id, note, created_at) VALUES (?, ?, ?, ?, ?)',
  batched: false,
  cursorOnly: false,
};

/** Copy order respects the references between tables. */
const TABLE_COPIES: readonly TableCopy[] = [
  CHAT_COPY,
  IMPORT_COPY,
  PARTICIPANT_COPY,
  MESSAGE_COPY,
  ATTACHMENT_COPY,
  BOOKMARK_COPY,
];

type Cell = string | number | null;

/** Narrows a SQLite cell to a bindable value. */
function toCell(value: unknown): Cell {
  return typeof value === 'string' || typeof value === 'number' ? value : null;
}

/** Copies one table's rows of one chat, in keyset batches when large. */
function copyTable(
  source: SqliteDatabase,
  target: SqliteDatabase,
  copy: TableCopy,
  chatId: string,
): void {
  if (!copy.batched) {
    const rows = source.selectArrays(copy.select, [chatId]);
    target.runEach(
      copy.insert,
      rows.map((row) => row.map(toCell)),
    );
    return;
  }
  let cursor = 0;
  for (;;) {
    const rows = source.selectArrays(copy.select, [chatId, cursor, COPY_BATCH_ROWS]);
    const last = rows.at(-1);
    if (last === undefined) {
      return;
    }
    target.runEach(
      copy.insert,
      rows.map((row) => row.slice(copy.cursorOnly ? 1 : 0).map(toCell)),
    );
    cursor = Number(last[0]);
  }
}

/** Lists the chat ids a backup covers: the requested ones that exist, or
 * every chat when `chatIds` is null. */
function resolveChatIds(db: SqliteDatabase, chatIds: readonly string[] | null): string[] {
  const all = db
    .selectArrays('SELECT id FROM chats ORDER BY last_ts_key DESC, id')
    .map((row) => String(row[0]));
  if (chatIds === null) {
    return all;
  }
  const wanted = new Set(chatIds);
  return all.filter((id) => wanted.has(id));
}

/** Reads the manifest summary of one chat. */
function summarizeChat(db: SqliteDatabase, chatId: string): BackupChatSummary {
  const row = db.selectArrays(
    `SELECT title, message_count, media_count, first_ts_key, last_ts_key
     FROM chats WHERE id = ?`,
    [chatId],
  )[0];
  const numberOrNull = (value: unknown): number | null => (value === null ? null : Number(value));
  return {
    id: chatId,
    title: typeof row?.[0] === 'string' ? row[0] : '',
    messageCount: Number(row?.[1] ?? 0),
    mediaCount: Number(row?.[2] ?? 0),
    firstTsKey: numberOrNull(row?.[3] ?? null),
    lastTsKey: numberOrNull(row?.[4] ?? null),
  };
}

/** Lists the stored media and thumbnail paths of one chat. */
function chatMediaPaths(db: SqliteDatabase, chatId: string): string[] {
  const paths: string[] = [];
  for (const row of db.selectArrays(
    "SELECT opfs_path, thumb_path FROM attachments WHERE chat_id = ? AND status = 'present'",
    [chatId],
  )) {
    for (const cell of row) {
      if (typeof cell === 'string') {
        paths.push(cell);
      }
    }
  }
  return paths;
}

/**
 * Builds a backup snapshot of the chosen chats.
 *
 * @param db The app database.
 * @param scratch Factory for the in-memory snapshot database.
 * @param chatIds The chats to include, or null for all of them.
 * @returns The serialized snapshot, its manifest chats and media paths.
 * @example
 * const snapshot = buildBackupSnapshot(db, scratch, null);
 * zip.add('db.sqlite3', snapshot.bytes);
 */
export function buildBackupSnapshot(
  db: SqliteDatabase,
  scratch: ScratchDatabases,
  chatIds: readonly string[] | null,
): BackupSnapshot {
  const ids = resolveChatIds(db, chatIds);
  const target = scratch.create();
  try {
    migrate(target);
    target.transaction(() => {
      // The full-text index stays empty: a restore re-indexes on insert.
      dropFtsTriggers(target);
      for (const chatId of ids) {
        for (const copy of TABLE_COPIES) {
          copyTable(db, target, copy, chatId);
        }
      }
      target.exec(FTS_TRIGGER_DDL);
    });
    return {
      bytes: target.exportBytes(),
      schemaVersion: readSchemaVersion(target),
      chats: ids.map((id) => summarizeChat(db, id)),
      mediaPaths: ids.flatMap((id) => chatMediaPaths(db, id)),
    };
  } finally {
    target.close();
  }
}

/** Average thumbnail size used by the estimate (bytes). */
const THUMB_ESTIMATE_BYTES = 20_000;
/** Per-message row overhead used by the estimate (bytes). */
const ROW_ESTIMATE_BYTES = 120;

/**
 * Estimates a backup's size before it is made (§10.6: shown first).
 *
 * @param db The app database.
 * @param chatIds The chats to include, or null for all of them.
 * @param includeMedia Whether media files go into the backup.
 * @returns An estimate in bytes (uncompressed).
 */
export function estimateBackupBytes(
  db: SqliteDatabase,
  chatIds: readonly string[] | null,
  includeMedia: boolean,
): number {
  let total = 0;
  for (const chatId of resolveChatIds(db, chatIds)) {
    const text = db.selectArrays(
      'SELECT COALESCE(SUM(length(CAST(body AS BLOB))), 0), COUNT(*) FROM messages WHERE chat_id = ?',
      [chatId],
    )[0];
    total += Number(text?.[0] ?? 0) + Number(text?.[1] ?? 0) * ROW_ESTIMATE_BYTES;
    if (includeMedia) {
      const media = db.selectArrays(
        `SELECT COALESCE(SUM(COALESCE(byte_size, 0)), 0), COUNT(thumb_path)
         FROM attachments WHERE chat_id = ? AND status = 'present'`,
        [chatId],
      )[0];
      total += Number(media?.[0] ?? 0) + Number(media?.[1] ?? 0) * THUMB_ESTIMATE_BYTES;
    }
  }
  return total;
}
