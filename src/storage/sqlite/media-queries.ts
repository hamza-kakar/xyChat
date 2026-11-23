/**
 * Media gallery statements: gallery and link pages
 * with their message context, lazily recorded video thumbnails and voice
 * note durations, and the decoded-audio cache paths that belong to chats.
 */
import * as v from 'valibot';
import type { AttachmentId, ChatId } from '../../core/ids';
import type { Attachment, AttachmentPage, LinkPage } from '../repository';
import { audioCachePathFor } from '../audio-cache';
import { attachmentFromRow, messageContextFromRow } from './rows';
import type { SqliteDatabase } from './open';

/** Media types whose files may get a decoded-audio cache entry. */
const AUDIO_TYPES = "('voice', 'audio')";
/** Media types that get lazy video thumbnails. */
const VIDEO_TYPES: readonly string[] = ['video', 'gif'];

/** Message columns joined onto gallery and link rows. */
const MESSAGE_CONTEXT_COLUMNS =
  'm.id AS m_id, m.seq AS m_seq, m.ts_local AS m_ts_local, p.display_name AS m_author_name';

/** Next keyset cursor: the last row's seq when the page is full. */
function nextSeqCursor(rows: readonly Record<string, unknown>[], limit: number): number | null {
  const last = rows.at(-1)?.['m_seq'];
  return rows.length === limit && typeof last === 'number' ? last : null;
}

/**
 * One gallery page: stored files of the given media types, newest message
 * first. Omitted and missing media have no file and are left out.
 *
 * @param db Open database.
 * @param q Chat, media types, the seq to continue below (null for the
 *   first page) and the page size.
 * @returns Items with their message context and the next cursor.
 */
export function listGalleryItems(
  db: SqliteDatabase,
  q: {
    readonly chatId: ChatId;
    readonly types: readonly string[];
    readonly cursor: number | null;
    readonly limit: number;
  },
): AttachmentPage {
  if (q.types.length === 0) {
    return { items: [], nextCursor: null };
  }
  const placeholders = q.types.map(() => '?').join(',');
  const rows = db.selectObjects(
    `SELECT a.*, ${MESSAGE_CONTEXT_COLUMNS}
     FROM attachments a
     JOIN messages m ON m.id = a.message_id
     LEFT JOIN participants p ON p.id = m.author_id
     WHERE a.chat_id = ? AND a.status = 'present' AND a.media_type IN (${placeholders})
       AND (? IS NULL OR m.seq < ?)
     ORDER BY m.seq DESC, a.id
     LIMIT ?`,
    [q.chatId, ...q.types, q.cursor, q.cursor, q.limit],
  );
  return {
    items: rows.map((row) => ({
      attachment: attachmentFromRow(row),
      message: messageContextFromRow(row),
    })),
    nextCursor: nextSeqCursor(rows, q.limit),
  };
}

/** A body column (validated before use). */
const BodyRow = v.object({ m_body: v.string() });

/**
 * One page of text messages that contain a link (Links tab), newest
 * first. The SQL narrows by scheme text; the app extracts the URLs.
 *
 * @param db Open database.
 * @param q Chat, the seq to continue below and the page size.
 * @returns Link-bearing messages and the next cursor.
 */
export function listLinkMessages(
  db: SqliteDatabase,
  q: { readonly chatId: ChatId; readonly cursor: number | null; readonly limit: number },
): LinkPage {
  const rows = db.selectObjects(
    `SELECT ${MESSAGE_CONTEXT_COLUMNS}, m.body AS m_body
     FROM messages m
     LEFT JOIN participants p ON p.id = m.author_id
     WHERE m.chat_id = ? AND m.kind = 'text'
       AND (m.body LIKE '%http://%' OR m.body LIKE '%https://%' OR m.body LIKE '%mailto:%')
       AND (? IS NULL OR m.seq < ?)
     ORDER BY m.seq DESC
     LIMIT ?`,
    [q.chatId, q.cursor, q.cursor, q.limit],
  );
  return {
    messages: rows.map((row) => {
      const parsed = v.safeParse(BodyRow, row);
      if (!parsed.success) {
        throw new Error('invalid messages row: m_body');
      }
      return { ...messageContextFromRow(row), chatId: q.chatId, body: parsed.output.m_body };
    }),
    nextCursor: nextSeqCursor(rows, q.limit),
  };
}

/**
 * One attachment row by id.
 *
 * @param db Open database.
 * @param attachmentId Attachment id.
 * @returns The attachment, or null when absent.
 */
export function getAttachment(db: SqliteDatabase, attachmentId: AttachmentId): Attachment | null {
  const rows = db.selectObjects('SELECT * FROM attachments WHERE id = ?', [attachmentId]);
  const row = rows[0];
  return row === undefined ? null : attachmentFromRow(row);
}

/**
 * Records a voice note's or audio file's duration, measured on first play. Only stored audio attachments are updated.
 *
 * @param db Open database.
 * @param attachmentId Attachment id.
 * @param durationMs Whole milliseconds.
 */
export function setAttachmentDuration(
  db: SqliteDatabase,
  attachmentId: AttachmentId,
  durationMs: number,
): void {
  db.run(
    `UPDATE attachments SET duration_ms = ?
     WHERE id = ? AND status = 'present' AND media_type IN ${AUDIO_TYPES}`,
    [durationMs, attachmentId],
  );
}

/**
 * Records a lazily generated video thumbnail. The original size
 * fills only fields the import left empty.
 *
 * @param db Open database.
 * @param input Attachment id, thumbnail path and the video's size.
 * @returns True when a stored video row was updated.
 */
export function setVideoThumbnail(
  db: SqliteDatabase,
  input: {
    readonly attachmentId: AttachmentId;
    readonly thumbPath: string;
    readonly width: number;
    readonly height: number;
  },
): boolean {
  const updated = db.selectObjects(
    `UPDATE attachments
     SET thumb_path = ?, width = COALESCE(width, ?), height = COALESCE(height, ?)
     WHERE id = ? AND status = 'present' AND media_type IN (${VIDEO_TYPES.map(() => '?').join(',')})
     RETURNING id`,
    [input.thumbPath, input.width, input.height, input.attachmentId, ...VIDEO_TYPES],
  );
  return updated.length > 0;
}

/** An attachment id column. */
const IdRow = v.object({ id: v.string() });

/** Decoded-audio cache paths of the audio attachments matched by a WHERE
 * clause over `attachments`. */
function audioCachePaths(
  db: SqliteDatabase,
  where: string,
  params: readonly (string | number)[],
): readonly string[] {
  const rows = db.selectObjects(
    `SELECT id FROM attachments WHERE media_type IN ${AUDIO_TYPES} AND ${where}`,
    [...params],
  );
  return rows.map((row) => {
    const parsed = v.safeParse(IdRow, row);
    if (!parsed.success) {
      throw new Error('invalid attachments row: id');
    }
    return audioCachePathFor(parsed.output.id);
  });
}

/**
 * Cache paths that may hold one chat's decoded audio, read before
 * the chat is deleted so the files go with it.
 *
 * @param db Open database.
 * @param chatId Chat about to be deleted.
 * @returns Paths under `cache/audio/` (some may not exist).
 */
export function listChatAudioCachePaths(db: SqliteDatabase, chatId: ChatId): readonly string[] {
  return audioCachePaths(db, 'chat_id = ?', [chatId]);
}

/**
 * Cache paths backed by a stored audio attachment; any other file under
 * `cache/audio/` is an orphan (sweep).
 *
 * @param db Open database.
 * @returns Every legitimate decoded-audio path.
 */
export function listKnownAudioCachePaths(db: SqliteDatabase): readonly string[] {
  return audioCachePaths(db, "status = 'present'", []);
}
