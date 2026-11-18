/**
 * Row → domain validation (AGENTS.md §18.5, §10.5): every row read from
 * SQLite is parsed through a Valibot schema before it becomes a domain
 * object. Invalid rows are a bug in the writer, not undefined behavior.
 */
import * as v from 'valibot';
import { asAttachmentId, asBookmarkId, asChatId, asImportId, asMessageId, asParticipantId } from '../../core/ids';
import type { Attachment, Bookmark, Chat, ChatSummary, ImportRecord, Message, Participant } from '../repository';
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
const BooleanInt = v.pipe(v.picklist([0, 1]), v.transform((n) => n === 1));

/** ISO-8601 UTC timestamp string. */
const IsoTimestamp = v.pipe(v.string(), v.regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u));

/** `ts_local` string form: `YYYY-MM-DDTHH:MM:SS` wall clock. */
const TsLocal = v.pipe(
  v.string(),
  v.regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/u),
  v.transform((raw) => parseLocalDateTime(raw)),
);

/** `extra_json` payload for poll messages. */
export const PollSchema = v.object({
  question: v.string(),
  options: v.array(v.object({ text: v.string(), votes: v.nullable(v.number()) })),
});

/** `extra_json` payload for location messages. */
export const LocationSchema = v.object({
  lat: v.number(),
  lng: v.number(),
  url: v.string(),
});

/** chats row schema. */
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

/** participants row schema. */
const ParticipantRow = v.object({
  id: ParticipantIdSchema,
  chat_id: ChatIdSchema,
  display_name: v.string(),
  color_index: v.number(),
  message_count: v.number(),
});

/** messages row schema (joined with author display name). */
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

/** attachments row schema. */
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

/** bookmarks row schema. */
const BookmarkRow = v.object({
  id: BookmarkIdSchema,
  chat_id: ChatIdSchema,
  message_id: v.number(),
  note: v.nullable(v.string()),
  created_at: IsoTimestamp,
});

/** imports row schema. */
const ImportRow = v.object({
  id: ImportIdSchema,
  chat_id: v.nullable(ChatIdSchema),
  file_name: v.string(),
  file_bytes: v.number(),
  status: v.picklist(['in_progress', 'complete', 'cancelled', 'failed', 'rolled_back']),
  parser_version: v.string(),
  started_at: IsoTimestamp,
  finished_at: v.nullable(IsoTimestamp),
});

/** Parses one row; throws a descriptive error on mismatch (writer bug). */
function parseRow<T>(schema: v.GenericSchema<unknown, T>, row: Record<string, unknown>, table: string): T {
  const result = v.safeParse(schema, row);
  if (!result.success) {
    const issues = result.issues.map((i) => `${i.path?.map((p) => String(p.key)).join('.')}: ${i.message}`).join('; ');
    throw new Error(`invalid ${table} row (id=${String(row['id'] ?? row['key'] ?? '?')}): ${issues}`);
  }
  return result.output;
}

/** Validates a chats row into a {@link Chat}. */
export function chatFromRow(row: Record<string, unknown>): Chat {
  return parseRow(ChatRow, row, 'chats');
}

/** Validates a participants row into a {@link Participant}. */
export function participantFromRow(row: Record<string, unknown>): Participant {
  return parseRow(ParticipantRow, row, 'participants');
}

/** Parses an `extra_json` payload for a message. */
function extraFromJson(
  raw: string | null,
  kind: Message['kind'],
): Message['poll'] & { readonly location?: Message['location'] } {
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

/** Validates a messages row into a {@link Message}. */
export function messageFromRow(row: Record<string, unknown>): Message {
  const parsed = parseRow(MessageRow, row, 'messages');
  const extra = extraFromJson(parsed.extra_json, parsed.kind);
  return {
    rowId: parsed.id,
    chatId: parsed.chat_id,
    fingerprint: parsed.fingerprint,
    seq: parsed.seq,
    tsLocal: parsed.ts_local,
    tsKey: parsed.ts_key,
    authorId: parsed.author_id,
    authorName: parsed.author_name,
    kind: parsed.kind,
    body: parsed.body,
    isEdited: parsed.is_edited,
    poll: parsed.kind === 'poll' ? (extra ?? null) : null,
    location: parsed.kind === 'location' ? (extra ?? null) : null,
  };
}

/** Validates an attachments row into an {@link Attachment}. */
export function attachmentFromRow(row: Record<string, unknown>): Attachment {
  return parseRow(AttachmentRow, row, 'attachments');
}

/** Validates a bookmarks row into a {@link Bookmark}. */
export function bookmarkFromRow(row: Record<string, unknown>): Bookmark {
  return parseRow(BookmarkRow, row, 'bookmarks');
}

/** Validates an imports row into an {@link ImportRecord}. */
export function importFromRow(row: Record<string, unknown>): ImportRecord {
  return parseRow(ImportRow, row, 'imports');
}

/** Chat-list aggregate row (subset of chats). */
const ChatSummaryRow = v.object({
  id: ChatIdSchema,
  title: v.string(),
  is_group: BooleanInt,
  message_count: v.number(),
  last_ts_key: v.nullable(v.number()),
  last_message_preview: v.nullable(v.string()),
});

/** Validates a chat-list row into a {@link ChatSummary}. */
export function chatSummaryFromRow(row: Record<string, unknown>): ChatSummary {
  return parseRow(ChatSummaryRow, row, 'chats(summary)');
}
