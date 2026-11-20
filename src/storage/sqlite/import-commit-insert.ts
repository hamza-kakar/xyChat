/**
 * Row insertion for import commits (AGENTS.md §9.2 step 10): incoming-only
 * messages land at their FINAL seq once displaced stored rows have vacated
 * (see import-commit-apply.ts), together with their participant and
 * attachment records.
 */
import type { ParsedMessage } from '../../core/model';
import { formatLocalDateTime } from './local-date-time-parse';
import { tsLocalToKey } from './ts-key';
import { upsertParticipant } from './participant-upsert';
import type { SqliteDatabase } from './open';
import type { InsertableAttachment, InsertableMessage } from './import-commit';

/** Context shared by the plan-application helpers (§8.10 walk state). */
export interface ApplyContext {
  readonly db: SqliteDatabase;
  readonly chatId: string;
  readonly importId: string;
  readonly attachmentByFingerprint: ReadonlyMap<string, InsertableAttachment>;
}

/** Inserts an incoming-only message (and its attachment record). */
export function applyIncomingRow(
  ctx: ApplyContext,
  merged: { readonly fingerprint: string },
  finalSeq: number,
  incomingByFingerprint: ReadonlyMap<string, InsertableMessage>,
): void {
  const item = incomingByFingerprint.get(merged.fingerprint);
  if (item === undefined) {
    return;
  }
  const message = item.message;
  const authorId = insertParticipant(ctx, message);
  const extraJson =
    message.poll !== null
      ? JSON.stringify(message.poll)
      : message.location !== null
        ? JSON.stringify(message.location)
        : null;

  ctx.db.run(
    `INSERT INTO messages (id, chat_id, fingerprint, seq, ts_local, ts_key, author_id, kind, body, is_edited, extra_json, import_id)
     VALUES (NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      ctx.chatId,
      item.fingerprint,
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
  );

  insertAttachment(ctx, item.fingerprint);
}

/** Upserts the author participant and bumps its message count. */
function insertParticipant(ctx: ApplyContext, message: ParsedMessage): string | null {
  if (message.author === null) {
    return null;
  }
  const authorId = upsertParticipant(ctx.db, ctx.chatId, message.author);
  ctx.db.run('UPDATE participants SET message_count = message_count + 1 WHERE id = ?', [authorId]);
  return authorId;
}

/** Inserts the attachment record for a message that references media. */
function insertAttachment(ctx: ApplyContext, fingerprint: string): void {
  const attachment = ctx.attachmentByFingerprint.get(fingerprint);
  if (attachment === undefined) {
    return;
  }
  const messageRowId = ctx.db.lastInsertRowId();
  ctx.db.run(
    `INSERT INTO attachments (id, message_id, chat_id, file_name, media_type, mime, byte_size, opfs_path, thumb_path, width, height, duration_ms, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
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
    ],
  );
}
