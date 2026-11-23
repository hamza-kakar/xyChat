/**
 * Row schemas for reading a backup database (AGENTS.md §10.6, §18.5):
 * every value from a user-picked backup is checked here before it becomes
 * restore input. Split from backup-read.ts.
 */
import * as v from 'valibot';
import { err, ok, type Result } from '../../core/result';
import type { MediaType, MessageKind } from '../../core/model';

/** Why a backup database can't be used. */
export type BackupReadErrorCode = 'CORRUPT_DATABASE' | 'SCHEMA_TOO_NEW';

/** A typed backup-read failure; the detail carries no content (§15.4). */
export interface BackupReadError {
  readonly code: BackupReadErrorCode;
  readonly detail: string;
}

/** Stored media paths look like `media/<chatId>/<attachmentId>.<ext>`. */
const MEDIA_PATH = /^media\/[A-Za-z0-9-]{1,64}\/[A-Za-z0-9-]{1,64}(?:\.[a-z0-9]{1,16})?$/u;
/** Thumbnail paths look like `thumbs/<chatId>/<attachmentId>.jpg`. */
const THUMB_PATH = /^thumbs\/[A-Za-z0-9-]{1,64}\/[A-Za-z0-9-]{1,64}\.jpg$/u;

const Count = v.pipe(v.number(), v.integer(), v.minValue(0));
const NullableCount = v.nullable(Count);
const Id = v.pipe(v.string(), v.nonEmpty(), v.maxLength(64));
const BooleanInt = v.pipe(
  v.picklist([0, 1]),
  v.transform((n) => n === 1),
);

export const PreviewRow = v.object({
  id: Id,
  title: v.string(),
  is_group: BooleanInt,
  message_count: Count,
  media_count: Count,
  first_ts_key: v.nullable(v.number()),
  last_ts_key: v.nullable(v.number()),
});

export const ChatRow = v.object({
  title: v.string(),
  is_group: BooleanInt,
  source_platform: v.picklist(['ios', 'android', 'unknown']),
  date_order: v.picklist(['DMY', 'MDY', 'YMD']),
  self_name: v.nullable(v.string()),
  parser_version: v.nullable(v.pipe(v.string(), v.maxLength(32))),
});

const KINDS: readonly MessageKind[] = [
  'text',
  'media',
  'system',
  'deleted',
  'call',
  'location',
  'contact',
  'poll',
];
const MEDIA_TYPES: readonly MediaType[] = [
  'image',
  'video',
  'audio',
  'voice',
  'sticker',
  'gif',
  'document',
  'contact-card',
  'other',
];

export const MessageRow = v.object({
  fingerprint: v.pipe(v.string(), v.regex(/^[0-9a-f]{32}$/u)),
  seq: Count,
  ts_local: v.pipe(v.string(), v.regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/u)),
  author_name: v.nullable(v.string()),
  kind: v.picklist(KINDS),
  body: v.string(),
  is_edited: BooleanInt,
  extra_json: v.nullable(v.string()),
});

export const AttachmentRow = v.object({
  fingerprint: MessageRow.entries.fingerprint,
  file_name: v.nullable(v.string()),
  media_type: v.picklist(MEDIA_TYPES),
  mime: v.nullable(v.pipe(v.string(), v.maxLength(128))),
  byte_size: NullableCount,
  opfs_path: v.nullable(v.pipe(v.string(), v.regex(MEDIA_PATH))),
  thumb_path: v.nullable(v.pipe(v.string(), v.regex(THUMB_PATH))),
  width: NullableCount,
  height: NullableCount,
  duration_ms: NullableCount,
  status: v.picklist(['present', 'missing', 'omitted']),
});

export const BookmarkRow = v.object({
  fingerprint: MessageRow.entries.fingerprint,
  note: v.nullable(v.string()),
  created_at: v.pipe(v.string(), v.regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u)),
});

export const PollPayload = v.object({
  question: v.string(),
  options: v.array(v.object({ text: v.string(), votes: v.nullable(v.number()) })),
});
export const LocationPayload = v.object({ lat: v.number(), lng: v.number(), url: v.string() });

/** Validates every row, or reports the table that failed. */
export function parseRows<T>(
  schema: v.GenericSchema<unknown, T>,
  rows: readonly Record<string, unknown>[],
  table: string,
): Result<T[], BackupReadError> {
  const parsed: T[] = [];
  for (const row of rows) {
    const result = v.safeParse(schema, row);
    if (!result.success) {
      return err({ code: 'CORRUPT_DATABASE', detail: `invalid ${table} row` });
    }
    parsed.push(result.output);
  }
  return ok(parsed);
}
