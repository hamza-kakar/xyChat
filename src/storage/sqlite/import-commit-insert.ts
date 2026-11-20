/**
 * Row insertion for import commits (AGENTS.md §9.2 step 10): incoming-only
 * messages land at their FINAL seq once displaced stored rows have vacated
 * (see import-commit-apply.ts), together with their participant and
 * attachment records.
 *
 * Batching (§17 budgets): messages insert in multi-row VALUES statements —
 * one bridge round-trip per ~500 rows instead of per row. Participants are
 * upserted once per distinct author and their counters adjusted in one
 * statement each; attachment rows resolve their message rowids with ONE
 * scan of the import's own messages and insert batched as well.
 */
import type { ParsedMessage } from '../../core/model';
import { formatLocalDateTime } from './local-date-time-parse';
import { tsLocalToKey } from './ts-key';
import { upsertParticipant } from './participant-upsert';
import type { SqliteDatabase } from './open';
import type { MergedMessage } from '../../core/merge';
import type { InsertableAttachment, InsertableMessage } from './import-commit';

/** Context shared by the plan-application helpers (§8.10 walk state). */
export interface ApplyContext {
  readonly db: SqliteDatabase;
  readonly chatId: string;
  readonly importId: string;
  readonly attachmentByFingerprint: ReadonlyMap<string, InsertableAttachment>;
}

/** One prepared message row: bound params plus the fingerprint for the
 * attachment rowid lookup. */
interface PreparedRow {
  readonly fingerprint: string;
  readonly params: readonly (string | number | null)[];
}

/** Shared row-building environment: the apply context plus the author
 * caches (upsert-once map and per-author message tallies). */
interface RowBuildEnv {
  readonly ctx: ApplyContext;
  readonly authorIds: Map<string, string>;
  readonly authorTallies: Map<string, number>;
}

const MESSAGE_INSERT_SQL =
  'INSERT INTO messages (chat_id, fingerprint, seq, ts_local, ts_key, author_id, kind, body, is_edited, extra_json, import_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';

/**
 * Inserts all incoming-only messages at their final seqs (batched), then
 * their attachment records.
 *
 * @returns The number of messages inserted.
 */
export function applyIncomingRows(
  ctx: ApplyContext,
  incomingFinals: readonly {
    readonly merged: MergedMessage;
    readonly finalSeq: number;
  }[],
  incomingByFingerprint: ReadonlyMap<string, InsertableMessage>,
): number {
  if (incomingFinals.length === 0) {
    return 0;
  }

  const env: RowBuildEnv = { ctx, authorIds: new Map(), authorTallies: new Map() };
  const rows: PreparedRow[] = [];
  for (const { merged, finalSeq } of incomingFinals) {
    const item = incomingByFingerprint.get(merged.fingerprint);
    if (item === undefined) {
      continue;
    }
    rows.push(prepareMessageRow(env, merged.fingerprint, item, finalSeq));
  }
  insertMessageBatches(ctx.db, rows);
  applyAuthorTallies(ctx.db, env.authorTallies);
  insertAttachments(ctx, rows);

  return rows.length;
}

/** Builds the bound params for one message row, resolving (and caching) the
 * author participant and tallying its message count. */
function prepareMessageRow(
  env: RowBuildEnv,
  fingerprint: string,
  item: InsertableMessage,
  finalSeq: number,
): PreparedRow {
  const { ctx, authorIds, authorTallies } = env;
  const message = item.message;
  let authorId: string | null = null;
  if (message.author !== null) {
    const cached = authorIds.get(message.author);
    if (cached === undefined) {
      authorId = upsertParticipant(ctx.db, ctx.chatId, message.author);
      authorIds.set(message.author, authorId);
    } else {
      authorId = cached;
    }
    authorTallies.set(authorId, (authorTallies.get(authorId) ?? 0) + 1);
  }
  const extraJson = extraJsonFor(message);
  return {
    fingerprint,
    params: [
      ctx.chatId,
      fingerprint,
      finalSeq,
      formatLocalDateTime(message.timestamp),
      tsLocalToKey(message.timestamp),
      authorId,
      message.kind,
      message.body,
      message.isEdited ? 1 : 0,
      extraJson,
      ctx.importId,
    ],
  };
}

/** Serializes the poll/location payload of a message (§7 extra_json). */
function extraJsonFor(message: ParsedMessage): string | null {
  if (message.poll !== null) {
    return JSON.stringify(message.poll);
  }
  return message.location !== null ? JSON.stringify(message.location) : null;
}

/** Runs the prepared single-row INSERT once per message row (§17: exec()
 * re-parses the SQL text per call — the prepared handle parses once). */
function insertMessageBatches(db: SqliteDatabase, rows: readonly PreparedRow[]): void {
  db.runEach(
    MESSAGE_INSERT_SQL,
    rows.map((row) => row.params),
  );
}

/** Applies the per-author message-count tallies in one statement each. */
function applyAuthorTallies(db: SqliteDatabase, tallies: ReadonlyMap<string, number>): void {
  for (const [authorId, count] of tallies) {
    db.run('UPDATE participants SET message_count = message_count + ? WHERE id = ?', [
      count,
      authorId,
    ]);
  }
}

/** Inserts attachment records for the prepared rows that carry media,
 * resolving message rowids with one scan of this import's messages. */
function insertAttachments(ctx: ApplyContext, rows: readonly PreparedRow[]): void {
  const wanted = rows.filter((row) => ctx.attachmentByFingerprint.has(row.fingerprint));
  if (wanted.length === 0) {
    return;
  }
  const rowIdByFingerprint = new Map<string, number>();
  const imported = ctx.db.selectArrays(
    'SELECT fingerprint, id FROM messages WHERE chat_id = ? AND import_id = ?',
    [ctx.chatId, ctx.importId],
  );
  for (const row of imported) {
    rowIdByFingerprint.set(String(row[0]), Number(row[1]));
  }

  const paramRows: (string | number | null)[][] = [];
  for (const row of wanted) {
    const attachment = ctx.attachmentByFingerprint.get(row.fingerprint);
    const messageRowId = rowIdByFingerprint.get(row.fingerprint);
    if (attachment === undefined || messageRowId === undefined) {
      continue;
    }
    paramRows.push([
      attachment.id,
      messageRowId,
      ctx.chatId,
      attachment.fileName,
      attachment.mediaType,
      attachment.mime,
      attachment.byteSize,
      attachment.opfsPath,
      attachment.thumbPath,
      attachment.width,
      attachment.height,
      attachment.durationMs,
      attachment.status,
    ]);
  }

  ctx.db.runEach(
    'INSERT INTO attachments (id, message_id, chat_id, file_name, media_type, mime, byte_size, opfs_path, thumb_path, width, height, duration_ms, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    paramRows,
  );
}
