/**
 * RPC input validation (AGENTS.md §18.5): every db.worker
 * method validates its inputs with Valibot at the worker boundary before
 * touching the repository. Invalid data → typed RpcValidationError (the
 * worker answers INVALID_INPUT), never undefined behavior.
 */
import {
  array,
  boolean,
  check,
  integer,
  maxLength,
  maxValue,
  minLength,
  minValue,
  nullable,
  number,
  object,
  picklist,
  pipe,
  regex,
  safeParse,
  string,
  type GenericSchema,
  type InferOutput,
} from 'valibot';
import { asChatId, asParticipantId, type ChatId, type ParticipantId } from '../core/ids';
import type { LocalDateTime, MediaType } from '../core/model';
import type { SearchQuery } from '../storage/repository';
import type { ImportRecordInput } from '../storage/sqlite/import-record';
import type { ImportCommitInput } from '../storage/sqlite/import-commit';

/** Validation failure for one RPC call (§18.5). */
export class RpcValidationError extends Error {}

/** Integer in [0, 2^53): rowids, seqs, timestamps as seconds. */
const NON_NEGATIVE_INT = pipe(number(), integer(), minValue(0), maxValue(Number.MAX_SAFE_INTEGER));
/** Identifier strings (UUIDs, fingerprints keys, import ids). */
const ID_STRING = pipe(string(), minLength(1), maxLength(64));
/** Renders the dotted path of a Valibot issue ('' for root issues). Root
 * issues may carry no path, so the parameter stays tolerant (§18.5). */
function issuePath(path: readonly { readonly key: unknown }[] | undefined): string {
  return (path ?? []).map((item) => String(item.key)).join('.');
}

function invalid(method: string, detail: string): RpcValidationError {
  return new RpcValidationError(`${method}: ${detail}`);
}

/** Branded id after validation — the worker RPC boundary is a sanctioned
 * minting point, like rows.ts (ADR 0010). */
function parseId(method: string, input: unknown): string {
  const result = safeParse(ID_STRING, input);
  if (!result.success) {
    throw invalid(method, result.issues[0].message);
  }
  return result.output;
}

/** Parses `input` against `schema`, failing with a method-tagged error. */
function withSchema<S extends GenericSchema>(
  method: string,
  schema: S,
  input: unknown,
): InferOutput<S> {
  const result = safeParse(schema, input);
  if (!result.success) {
    const issue = result.issues[0];
    throw invalid(method, `${issuePath(issue.path)}: ${issue.message}`);
  }
  return result.output;
}

const LOCAL_DATE_TIME = object({
  year: pipe(number(), integer(), minValue(1970), maxValue(2200)),
  month: pipe(number(), integer(), minValue(1), maxValue(12)),
  day: pipe(number(), integer(), minValue(1), maxValue(31)),
  hour: pipe(number(), integer(), minValue(0), maxValue(23)),
  minute: pipe(number(), integer(), minValue(0), maxValue(59)),
  second: pipe(number(), integer(), minValue(0), maxValue(59)),
});

const MESSAGE_KIND = picklist([
  'text',
  'media',
  'system',
  'deleted',
  'call',
  'location',
  'contact',
  'poll',
] as const);

const MEDIA_TYPE = picklist([
  'image',
  'video',
  'audio',
  'voice',
  'sticker',
  'gif',
  'document',
  'contact-card',
  'other',
] as const);

const MESSAGE_KINDS = pipe(array(MESSAGE_KIND), maxLength(8));

/** §8.10 fingerprint: 32 lowercase hex chars. */
const FINGERPRINT = pipe(string(), regex(/^[0-9a-f]{32}$/u, 'fingerprint must be 32 hex chars'));

const PARSED_MESSAGE = object({
  seq: NON_NEGATIVE_INT,
  sourceLine: NON_NEGATIVE_INT,
  timestamp: LOCAL_DATE_TIME,
  author: nullable(pipe(string(), minLength(1), maxLength(500))),
  kind: MESSAGE_KIND,
  body: pipe(string(), maxLength(100_000)),
  isEdited: boolean(),
  attachment: nullable(
    object({
      fileName: nullable(pipe(string(), minLength(1), maxLength(255))),
      mediaType: MEDIA_TYPE,
      status: picklist(['referenced', 'omitted'] as const),
    }),
  ),
  poll: nullable(
    object({
      question: pipe(string(), minLength(1), maxLength(500)),
      options: pipe(
        array(
          object({
            text: pipe(string(), minLength(1), maxLength(500)),
            votes: nullable(pipe(number(), integer(), minValue(0), maxValue(1_000_000_000))),
          }),
        ),
        maxLength(64),
      ),
    }),
  ),
  location: nullable(
    object({
      lat: pipe(number(), minValue(-90), maxValue(90)),
      lng: pipe(number(), minValue(-180), maxValue(180)),
      url: pipe(string(), minLength(1), maxLength(2000)),
    }),
  ),
});

const INSERTABLE_MESSAGE = object({
  fingerprint: FINGERPRINT,
  message: PARSED_MESSAGE,
});

const INSERTABLE_ATTACHMENT = object({
  id: ID_STRING,
  fingerprintOfMessage: FINGERPRINT,
  fileName: nullable(pipe(string(), minLength(1), maxLength(255))),
  mediaType: MEDIA_TYPE,
  mime: nullable(pipe(string(), minLength(1), maxLength(100))),
  byteSize: nullable(NON_NEGATIVE_INT),
  opfsPath: nullable(pipe(string(), minLength(1), maxLength(512))),
  thumbPath: nullable(pipe(string(), minLength(1), maxLength(512))),
  width: nullable(pipe(number(), integer(), minValue(0), maxValue(1_000_000))),
  height: nullable(pipe(number(), integer(), minValue(0), maxValue(1_000_000))),
  durationMs: nullable(NON_NEGATIVE_INT),
  status: picklist(['present', 'missing', 'omitted'] as const),
});

const MESSAGE_WINDOW_QUERY = object({
  chatId: ID_STRING,
  anchorSeq: NON_NEGATIVE_INT,
  before: pipe(number(), integer(), minValue(0), maxValue(1000)),
  after: pipe(number(), integer(), minValue(0), maxValue(1000)),
});

const SEARCH_QUERY = object({
  chatId: nullable(ID_STRING),
  query: pipe(string(), minLength(1), maxLength(500)),
  authorId: nullable(ID_STRING),
  kinds: nullable(MESSAGE_KINDS),
  dateFromTsKey: nullable(NON_NEGATIVE_INT),
  dateToTsKey: nullable(NON_NEGATIVE_INT),
  limit: pipe(number(), integer(), minValue(1), maxValue(500)),
  cursor: nullable(
    object({
      tsKey: NON_NEGATIVE_INT,
      rowId: NON_NEGATIVE_INT,
      seq: NON_NEGATIVE_INT,
    }),
  ),
});

const ATTACHMENTS_QUERY = object({
  chatId: ID_STRING,
  types: pipe(array(MEDIA_TYPE), maxLength(9)),
  cursor: nullable(NON_NEGATIVE_INT),
  limit: pipe(number(), integer(), minValue(1), maxValue(500)),
});

const LINKS_QUERY = object({
  chatId: ID_STRING,
  cursor: nullable(NON_NEGATIVE_INT),
  limit: pipe(number(), integer(), minValue(1), maxValue(500)),
});

const BOOKMARK_NOTE = nullable(pipe(string(), maxLength(2000)));

const IMPORT_RECORD_INPUT = object({
  importId: ID_STRING,
  fileName: pipe(string(), minLength(1), maxLength(255)),
  fileBytes: NON_NEGATIVE_INT,
  parserVersion: pipe(string(), minLength(1), maxLength(32)),
});

const COMMIT_IMPORT_INPUT = object({
  importId: ID_STRING,
  targetChatId: nullable(ID_STRING),
  newChat: object({
    title: pipe(string(), minLength(1), maxLength(200)),
    isGroup: boolean(),
    sourcePlatform: picklist(['ios', 'android', 'unknown'] as const),
    dateOrder: picklist(['DMY', 'MDY', 'YMD'] as const),
  }),
  messages: pipe(array(INSERTABLE_MESSAGE), maxLength(200_000)),
  attachments: pipe(array(INSERTABLE_ATTACHMENT), maxLength(200_000)),
  fileName: pipe(string(), minLength(1), maxLength(255)),
  fileBytes: NON_NEGATIVE_INT,
  parserVersion: pipe(string(), minLength(1), maxLength(32)),
});

/** OPFS paths are worker-generated; traversal and absolute forms are
 * rejected defensively — rollback deletion must never escape the media root
 * (§15.2). */
const WRITTEN_PATH = pipe(
  string(),
  minLength(1),
  maxLength(512),
  check(
    (value) => !value.includes('..') && !value.startsWith('/'),
    'path must be relative under the media root',
  ),
);
const WRITTEN_PATHS = pipe(array(WRITTEN_PATH), maxLength(200_000));

export interface MessageWindowInput {
  readonly chatId: ChatId;
  readonly anchorSeq: number;
  readonly before: number;
  readonly after: number;
}

export type AttachmentTypes = readonly MediaType[];

/** Parsers used by db.worker — each returns fully validated, branded data. */
export const rpcInput = {
  /** Generic identifier (bookmark ids, import ids). */
  id(method: string, input: unknown): string {
    return parseId(method, input);
  },
  chatId(method: string, input: unknown): ChatId {
    return asChatId(parseId(method, input));
  },
  participantId(method: string, input: unknown): ParticipantId | null {
    return input === null ? null : asParticipantId(parseId(method, input));
  },
  localDateTime(method: string, input: unknown): LocalDateTime {
    return withSchema(method, LOCAL_DATE_TIME, input);
  },
  messageWindow(method: string, input: unknown): MessageWindowInput {
    const parsed = withSchema(method, MESSAGE_WINDOW_QUERY, input);
    return {
      chatId: asChatId(parsed.chatId),
      anchorSeq: parsed.anchorSeq,
      before: parsed.before,
      after: parsed.after,
    };
  },
  search(method: string, input: unknown): SearchQuery {
    const parsed = withSchema(method, SEARCH_QUERY, input);
    return {
      chatId: parsed.chatId === null ? null : asChatId(parsed.chatId),
      query: parsed.query,
      authorId: parsed.authorId === null ? null : asParticipantId(parsed.authorId),
      kinds: parsed.kinds,
      dateFromTsKey: parsed.dateFromTsKey,
      dateToTsKey: parsed.dateToTsKey,
      limit: parsed.limit,
      cursor: parsed.cursor,
    };
  },
  attachments(
    method: string,
    input: unknown,
  ): {
    readonly chatId: ChatId;
    readonly types: AttachmentTypes;
    readonly cursor: number | null;
    readonly limit: number;
  } {
    const parsed = withSchema(method, ATTACHMENTS_QUERY, input);
    return {
      chatId: asChatId(parsed.chatId),
      types: parsed.types,
      cursor: parsed.cursor,
      limit: parsed.limit,
    };
  },
  links(
    method: string,
    input: unknown,
  ): { readonly chatId: ChatId; readonly cursor: number | null; readonly limit: number } {
    const parsed = withSchema(method, LINKS_QUERY, input);
    return { chatId: asChatId(parsed.chatId), cursor: parsed.cursor, limit: parsed.limit };
  },
  nonNegativeInt(method: string, input: unknown): number {
    return withSchema(method, NON_NEGATIVE_INT, input);
  },
  bookmarkNote(method: string, input: unknown): string | null {
    return withSchema(method, BOOKMARK_NOTE, input);
  },
  importRecord(method: string, input: unknown): ImportRecordInput {
    return withSchema(method, IMPORT_RECORD_INPUT, input);
  },
  commitImport(method: string, input: unknown): ImportCommitInput {
    return withSchema(method, COMMIT_IMPORT_INPUT, input);
  },

  /** Non-throwing variant for the §3.2 commit-port dispatcher: null when
   * invalid (§18.5). */
  tryCommitImport(input: unknown): ImportCommitInput | null {
    const result = safeParse(COMMIT_IMPORT_INPUT, input);
    return result.success ? result.output : null;
  },
  writtenPaths(method: string, input: unknown): readonly string[] {
    return withSchema(method, WRITTEN_PATHS, input);
  },
  title(method: string, input: unknown): string {
    return withSchema(method, pipe(string(), minLength(1), maxLength(200)), input);
  },
};
