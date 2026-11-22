/**
 * Row → domain validation (AGENTS.md §18.5, §10.5): every row read from
 * SQLite is parsed through a Valibot schema and mapped to its camelCase
 * domain object. Invalid rows throw a descriptive error — they are writer
 * bugs, not undefined behavior.
 */
import * as v from 'valibot';
import {
  asAttachmentId,
  asBookmarkId,
  asChatId,
  asImportId,
  asMessageId,
  asParticipantId,
} from '../../core/ids';
import type {
  Attachment,
  Bookmark,
  Chat,
  ChatSummary,
  ImportRecord,
  Message,
  Participant,
} from '../repository';
import type { ParsedLocation, ParsedPoll } from '../../core/model';
import { parseLocalDateTime } from './local-date-time-parse';

/** String branded as a chat id. */
const ChatIdSchema = v.pipe(v.string(), v.nonEmpty(), v.transform(asChatId));
/** String branded as a participant id. */
const ParticipantIdSchema = v.pipe(v.string(), v.nonEmpty(), v.transform(asParticipantId));
/** String branded as a message fingerprint. */
const MessageIdSchema = v.pipe(v.string(), v.nonEmpty(), v.transform(asMessageId));
/** String branded as an attachment id. */
const AttachmentIdSchema = v.pipe(v.string(), v.nonEmpty(), v.transform(asAttachmentId));
/** String branded as a bookmark id. */
const BookmarkIdSchema = v.pipe(v.string(), v.nonEmpty(), v.transform(asBookmarkId));
/** String branded as an import id. */
const ImportIdSchema = v.pipe(v.string(), v.nonEmpty(), v.transform(asImportId));

/** 0/1 integer mapped to a boolean. */
const BooleanInt = v.pipe(
  v.picklist([0, 1]),
  v.transform((n) => n === 1),
);

/** ISO-8601 UTC timestamp string. */
const IsoTimestamp = v.pipe(v.string(), v.regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u));

/** `ts_local` string form: `YYYY-MM-DDTHH:MM:SS` wall clock. */
const TsLocal = v.pipe(
  v.string(),
  v.regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/u),
  v.transform((raw) => parseLocalDateTime(raw)),
);

/** Poll `extra_json` payload schema. */
const PollSchema = v.object({
  question: v.string(),
  options: v.array(v.object({ text: v.string(), votes: v.nullable(v.number()) })),
});

/** Location `extra_json` payload schema. */
const LocationSchema = v.object({
  lat: v.number(),
  lng: v.number(),
  url: v.string(),
});

/** Parses one row; throws a descriptive error on mismatch (writer bug). */
function parseRow<T>(
  schema: v.GenericSchema<unknown, T>,
  row: Record<string, unknown>,
  table: string,
): T {
  const result = v.safeParse(schema, row);
  if (!result.success) {
    const issues = result.issues
      .map((i) => `${i.path?.map((p) => String(p.key)).join('.')}: ${i.message}`)
      .join('; ');
    const rowId = row['id'] ?? row['key'];
    const rowIdText = typeof rowId === 'string' || typeof rowId === 'number' ? String(rowId) : '?';
    throw new Error(`invalid ${table} row (id=${rowIdText}): ${issues}`);
  }
  return result.output;
}

/** Parses an `extra_json` payload for a poll or location message. */
function extraFromJson(
  raw: string | null,
  kind: Message['kind'],
): ParsedPoll | ParsedLocation | null {
  if (raw === null) {
    return null;
  }
  const parsed: unknown = JSON.parse(raw);
  if (kind === 'poll') {
    const poll = v.safeParse(PollSchema, parsed);
    return poll.success ? poll.output : null;
  }
  if (kind === 'location') {
    const loc = v.safeParse(LocationSchema, parsed);
    return loc.success ? loc.output : null;
  }
  return null;
}

const ChatRow = v.object({
  id: ChatIdSchema,
  title: v.string(),
  is_group: BooleanInt,
  self_participant_id: v.nullable(ParticipantIdSchema),
  source_platform: v.picklist(['ios', 'android', 'unknown']),
  date_order: v.picklist(['DMY', 'MDY', 'YMD']),
  message_count: v.number(),
  media_count: v.number(),
  media_bytes: v.number(),
  first_ts_key: v.nullable(v.number()),
  last_ts_key: v.nullable(v.number()),
  last_message_preview: v.nullable(v.string()),
  created_at: IsoTimestamp,
  updated_at: IsoTimestamp,
});

type ChatParsed = v.InferOutput<typeof ChatRow>;

/** Validates a chats row into a {@link Chat}. */
export function chatFromRow(row: Record<string, unknown>): Chat {
  const r: ChatParsed = parseRow(ChatRow, row, 'chats');
  return {
    id: r.id,
    title: r.title,
    isGroup: r.is_group,
    selfParticipantId: r.self_participant_id,
    sourcePlatform: r.source_platform,
    dateOrder: r.date_order,
    messageCount: r.message_count,
    mediaCount: r.media_count,
    mediaBytes: r.media_bytes,
    firstTsKey: r.first_ts_key,
    lastTsKey: r.last_ts_key,
    lastMessagePreview: r.last_message_preview,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

const ParticipantRow = v.object({
  id: ParticipantIdSchema,
  chat_id: ChatIdSchema,
  display_name: v.string(),
  color_index: v.number(),
  message_count: v.number(),
});

type ParticipantParsed = v.InferOutput<typeof ParticipantRow>;

/** Validates a participants row into a {@link Participant}. */
export function participantFromRow(row: Record<string, unknown>): Participant {
  const r: ParticipantParsed = parseRow(ParticipantRow, row, 'participants');
  return {
    id: r.id,
    chatId: r.chat_id,
    displayName: r.display_name,
    colorIndex: r.color_index,
    messageCount: r.message_count,
  };
}

const MessageRow = v.object({
  id: v.number(),
  chat_id: ChatIdSchema,
  fingerprint: MessageIdSchema,
  seq: v.number(),
  ts_local: TsLocal,
  ts_key: v.number(),
  author_id: v.nullable(ParticipantIdSchema),
  author_name: v.nullable(v.string()),
  kind: v.picklist(['text', 'media', 'system', 'deleted', 'call', 'location', 'contact', 'poll']),
  body: v.string(),
  is_edited: BooleanInt,
  extra_json: v.nullable(v.string()),
});

type MessageParsed = v.InferOutput<typeof MessageRow>;

/** Validates a messages row into a {@link Message}. */
export function messageFromRow(row: Record<string, unknown>): Message {
  const r: MessageParsed = parseRow(MessageRow, row, 'messages');
  const extra = extraFromJson(r.extra_json, r.kind);
  return {
    rowId: r.id,
    chatId: r.chat_id,
    fingerprint: r.fingerprint,
    seq: r.seq,
    tsLocal: r.ts_local,
    tsKey: r.ts_key,
    authorId: r.author_id,
    authorName: r.author_name,
    kind: r.kind,
    body: r.body,
    isEdited: r.is_edited,
    poll: r.kind === 'poll' ? (extra as ParsedPoll | null) : null,
    location: r.kind === 'location' ? (extra as ParsedLocation | null) : null,
  };
}

const AttachmentRow = v.object({
  id: AttachmentIdSchema,
  message_id: v.number(),
  chat_id: ChatIdSchema,
  file_name: v.nullable(v.string()),
  media_type: v.picklist([
    'image',
    'video',
    'audio',
    'voice',
    'sticker',
    'gif',
    'document',
    'contact-card',
    'other',
  ]),
  mime: v.nullable(v.string()),
  byte_size: v.nullable(v.number()),
  opfs_path: v.nullable(v.string()),
  thumb_path: v.nullable(v.string()),
  width: v.nullable(v.number()),
  height: v.nullable(v.number()),
  duration_ms: v.nullable(v.number()),
  status: v.picklist(['present', 'missing', 'omitted']),
});

type AttachmentParsed = v.InferOutput<typeof AttachmentRow>;

/** Validates an attachments row into an {@link Attachment}. */
export function attachmentFromRow(row: Record<string, unknown>): Attachment {
  const r: AttachmentParsed = parseRow(AttachmentRow, row, 'attachments');
  return {
    id: r.id,
    messageId: r.message_id,
    chatId: r.chat_id,
    fileName: r.file_name,
    mediaType: r.media_type,
    mime: r.mime,
    byteSize: r.byte_size,
    opfsPath: r.opfs_path,
    thumbPath: r.thumb_path,
    width: r.width,
    height: r.height,
    durationMs: r.duration_ms,
    status: r.status,
  };
}

const BookmarkRow = v.object({
  id: BookmarkIdSchema,
  chat_id: ChatIdSchema,
  message_id: v.number(),
  note: v.nullable(v.string()),
  created_at: IsoTimestamp,
});

type BookmarkParsed = v.InferOutput<typeof BookmarkRow>;

/** Validates a bookmarks row into a {@link Bookmark}. */
export function bookmarkFromRow(row: Record<string, unknown>): Bookmark {
  const r: BookmarkParsed = parseRow(BookmarkRow, row, 'bookmarks');
  return {
    id: r.id,
    chatId: r.chat_id,
    messageId: r.message_id,
    note: r.note,
    createdAt: r.created_at,
  };
}

const ImportRow = v.object({
  id: ImportIdSchema,
  chat_id: v.nullable(ChatIdSchema),
  file_name: v.string(),
  file_bytes: v.number(),
  status: v.picklist(['in_progress', 'complete', 'cancelled', 'failed', 'rolled_back']),
  parser_version: v.string(),
  started_at: IsoTimestamp,
  finished_at: v.nullable(IsoTimestamp),
  written_paths_json: v.string(),
});

type ImportParsed = v.InferOutput<typeof ImportRow>;

/** Parses JSON text, or returns null when it isn't valid JSON. */
function parseJsonOrNull(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

/** Validates an imports row into an {@link ImportRecord}. */
export function importFromRow(row: Record<string, unknown>): ImportRecord {
  const r: ImportParsed = parseRow(ImportRow, row, 'imports');
  // §18.5: the written-path list is Valibot-validated. Invalid JSON or an
  // invalid list reads as empty (rollback deletes nothing rather than
  // guessing).
  const paths = v.safeParse(v.array(v.string()), parseJsonOrNull(r.written_paths_json));
  return {
    id: r.id,
    chatId: r.chat_id,
    fileName: r.file_name,
    fileBytes: r.file_bytes,
    status: r.status,
    parserVersion: r.parser_version,
    startedAt: r.started_at,
    finishedAt: r.finished_at,
    writtenPaths: paths.success ? paths.output : [],
  };
}

const ChatSummaryRow = v.object({
  id: ChatIdSchema,
  title: v.string(),
  is_group: BooleanInt,
  message_count: v.number(),
  last_ts_key: v.nullable(v.number()),
  last_message_preview: v.nullable(v.string()),
});

type ChatSummaryParsed = v.InferOutput<typeof ChatSummaryRow>;

/** Validates a chat-list row into a {@link ChatSummary}. */
export function chatSummaryFromRow(row: Record<string, unknown>): ChatSummary {
  const r: ChatSummaryParsed = parseRow(ChatSummaryRow, row, 'chats(summary)');
  return {
    id: r.id,
    title: r.title,
    isGroup: r.is_group,
    messageCount: r.message_count,
    lastTsKey: r.last_ts_key,
    lastMessagePreview: r.last_message_preview,
  };
}
