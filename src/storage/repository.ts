/**
 * Persisted chat-archive entities (AGENTS.md §7, §10.2): camelCase domain
 * mirrors of the SQL schema rows, with branded IDs. `rows.ts` validates raw
 * SQLite rows into these types at every read.
 */
import type { Brand } from '../core/ids';
import type {
  AttachmentStatus,
  ClockFormat,
  DateOrder,
  LocalDateTime,
  MediaType,
  MessageKind,
  ParsedLocation,
  ParsedPoll,
  SourcePlatform,
} from '../core/model';

/** A persisted chat. */
export interface Chat {
  readonly id: Brand<string, 'ChatId'>;
  readonly title: string;
  readonly isGroup: boolean;
  /** Participant chosen as "me", or null until the user picks one. */
  readonly selfParticipantId: Brand<string, 'ParticipantId'> | null;
  readonly sourcePlatform: SourcePlatform;
  readonly dateOrder: DateOrder;
  readonly messageCount: number;
  readonly mediaCount: number;
  readonly mediaBytes: number;
  /** Wall-clock seconds treating ts_local as UTC; ordering only. */
  readonly firstTsKey: number | null;
  readonly lastTsKey: number | null;
  readonly lastMessagePreview: string | null;
  /** ISO-8601 UTC app-bookkeeping stamps, not chat data. */
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** A chat participant with its palette index and message count. */
export interface Participant {
  readonly id: Brand<string, 'ParticipantId'>;
  readonly chatId: Brand<string, 'ChatId'>;
  readonly displayName: string;
  readonly colorIndex: number;
  readonly messageCount: number;
}

/** A persisted message (denormalized author display name for reads). */
export interface Message {
  /** SQLite rowid; also the FTS external-content rowid. */
  readonly rowId: number;
  readonly chatId: Brand<string, 'ChatId'>;
  readonly fingerprint: Brand<string, 'MessageId'>;
  readonly seq: number;
  readonly tsLocal: LocalDateTime;
  readonly tsKey: number;
  readonly authorId: Brand<string, 'ParticipantId'> | null;
  readonly authorName: string | null;
  readonly kind: MessageKind;
  readonly body: string;
  readonly isEdited: boolean;
  readonly poll: ParsedPoll | null;
  readonly location: ParsedLocation | null;
  /** The import run that first stored this message. */
  readonly importId: Brand<string, 'ImportId'>;
}

/** A persisted attachment record (bytes live in OPFS, not SQLite). */
export interface Attachment {
  readonly id: Brand<string, 'AttachmentId'>;
  readonly messageId: number;
  readonly chatId: Brand<string, 'ChatId'>;
  readonly fileName: string | null;
  readonly mediaType: MediaType;
  readonly mime: string | null;
  readonly byteSize: number | null;
  readonly opfsPath: string | null;
  readonly thumbPath: string | null;
  readonly width: number | null;
  readonly height: number | null;
  readonly durationMs: number | null;
  readonly status: AttachmentStatus;
}

/** A bookmark with an optional note. */
export interface Bookmark {
  readonly id: Brand<string, 'BookmarkId'>;
  readonly chatId: Brand<string, 'ChatId'>;
  readonly messageId: number;
  readonly note: string | null;
  readonly createdAt: string;
}

/** One completed (or rolled back) import run. */
export interface ImportRecord {
  readonly id: Brand<string, 'ImportId'>;
  readonly chatId: Brand<string, 'ChatId'> | null;
  readonly fileName: string;
  readonly fileBytes: number;
  readonly status: 'in_progress' | 'complete' | 'cancelled' | 'failed' | 'rolled_back';
  readonly parserVersion: string;
  readonly startedAt: string;
  readonly finishedAt: string | null;
  /** CUMULATIVE written-path list (§9.3 crash rollback bookkeeping; each
   * flush replaces the row with a superset). Empty until the first flush. */
  readonly writtenPaths: readonly string[];
}

/** Chat-list row: aggregates only, no message bodies. */
export interface ChatSummary {
  readonly id: Brand<string, 'ChatId'>;
  readonly title: string;
  readonly isGroup: boolean;
  readonly messageCount: number;
  readonly lastTsKey: number | null;
  readonly lastMessagePreview: string | null;
  /** Kind of the last message by seq (null for an empty chat). */
  readonly lastMessageKind: MessageKind | null;
  /** Author display name of the last message (null for system messages). */
  readonly lastAuthorName: string | null;
  /** Media type of the last message's attachment, if it has one. */
  readonly lastMediaType: MediaType | null;
}

/** A window of messages around an anchor seq (§12.5). */
export interface MessageWindow {
  readonly messages: readonly (Message & { readonly attachments: readonly Attachment[] })[];
  readonly hasBefore: boolean;
  readonly hasAfter: boolean;
}

/** A search hit (§11): never contains FTS HTML markup. */
export interface SearchHit {
  readonly messageRowId: number;
  readonly chatId: Brand<string, 'ChatId'>;
  readonly seq: number;
  readonly tsLocal: LocalDateTime;
  readonly authorName: string | null;
  /** Body excerpt ±40 chars around the first match, ellipsized. */
  readonly snippet: string;
}

/** Keyset-paginated search page (cursor = last ts_key + rowid + seq; the
 * in-chat ordering keys on seq, the global ordering on ts_key). */
export interface SearchPage {
  readonly hits: readonly SearchHit[];
  readonly nextCursor: SearchPageCursor | null;
}

/** Keyset cursor fields for search paging (§11). */
export interface SearchPageCursor {
  readonly tsKey: number;
  readonly rowId: number;
  readonly seq: number;
}

/** Query parameters for search (§11). */
export interface SearchQuery {
  readonly chatId: Brand<string, 'ChatId'> | null;
  readonly query: string;
  readonly authorId: Brand<string, 'ParticipantId'> | null;
  readonly kinds: readonly MessageKind[] | null;
  readonly dateFromTsKey: number | null;
  readonly dateToTsKey: number | null;
  readonly limit: number;
  readonly cursor: SearchPageCursor | null;
}

/** An in-chat search for navigation (§11): every matching seq, no paging. */
export interface InChatSearchQuery {
  readonly chatId: Brand<string, 'ChatId'>;
  readonly query: string;
  readonly authorId: Brand<string, 'ParticipantId'> | null;
  readonly kinds: readonly MessageKind[] | null;
  readonly dateFromTsKey: number | null;
  readonly dateToTsKey: number | null;
}

/** Matching seqs of an in-chat search, ascending. */
export interface MatchingSeqs {
  readonly seqs: readonly number[];
  /** True when more messages matched than were returned. */
  readonly isCapped: boolean;
}

/** Where a gallery item or link sits in its chat (§12.6 "Show in chat"). */
export interface MessageContext {
  readonly messageRowId: number;
  readonly seq: number;
  readonly tsLocal: LocalDateTime;
  readonly authorName: string | null;
}

/** One stored media file in the gallery, with its message context. */
export interface GalleryItem {
  readonly attachment: Attachment;
  readonly message: MessageContext;
}

/** Media-gallery page, newest first (keyset by message seq: an export
 * message carries at most one attachment). */
export interface AttachmentPage {
  readonly items: readonly GalleryItem[];
  readonly nextCursor: number | null;
}

/** A text message that contains a link (§12.6 Links tab); the app
 * extracts the URLs with the same linkifier the bubbles use. */
export interface LinkMessage extends MessageContext {
  readonly chatId: Brand<string, 'ChatId'>;
  readonly body: string;
}

/** Links page, newest first (keyset by message seq). */
export interface LinkPage {
  readonly messages: readonly LinkMessage[];
  readonly nextCursor: number | null;
}

/** Chat-info statistics (§12.7). */
export interface ChatStats {
  readonly totalsByKind: Readonly<Record<MessageKind, number>>;
  readonly mediaCounts: Readonly<Record<MediaType, number>>;
  readonly mediaBytes: number;
  readonly dateRange: { readonly first: LocalDateTime; readonly last: LocalDateTime } | null;
}

/** Storage usage aggregates (§12.9). */
export interface StorageUsage {
  readonly totalBytes: number;
  readonly perChat: readonly { readonly chatId: Brand<string, 'ChatId'>; readonly bytes: number }[];
}

/** Where the user last was in a chat (§12.5: restored on return). */
export interface ChatPosition {
  readonly chatId: Brand<string, 'ChatId'>;
  /** Seq of the first message visible at the top of the list. */
  readonly seq: number;
}

/** Bookmark joined with its message for the bookmarks screen. */
export interface BookmarkView {
  readonly bookmark: Bookmark;
  readonly message: Message;
}

/** Clock/date-order/format shape needed by import confirmation (§12.8). */
export interface ExportFormat {
  readonly platform: SourcePlatform;
  readonly dateOrder: DateOrder;
  readonly clock: ClockFormat;
}

export type {
  AttachmentStatus,
  DateOrder,
  LocalDateTime,
  MediaType,
  MessageKind,
  SourcePlatform,
} from '../core/model';
export type { ParsedPoll as Poll, ParsedLocation as Location } from '../core/model';
