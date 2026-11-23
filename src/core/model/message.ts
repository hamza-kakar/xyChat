/**
 * Parsed message domain types. These describe what the parser
 * produces from an export file, before any persistence.
 */
import type { LocalDateTime } from './source';

/** The classification of a message after parsing. */
export type MessageKind =
  'text' | 'media' | 'system' | 'deleted' | 'call' | 'location' | 'contact' | 'poll';

/** The media category of an attachment. */
export type MediaType =
  'image' | 'video' | 'audio' | 'voice' | 'sticker' | 'gif' | 'document' | 'contact-card' | 'other';

/** Why an attachment's bytes are or are not available. */
export type AttachmentStatus =
  | 'present' // file found in the archive and stored
  | 'missing' // referenced by name but absent from the archive
  | 'omitted'; // export was made "without media" (placeholder text)

/** An attachment reference parsed from a message body. */
export interface ParsedAttachmentRef {
  /** Original file name in the archive; null when the export omitted media. */
  readonly fileName: string | null;
  readonly mediaType: MediaType;
  readonly status: 'referenced' | 'omitted';
}

/** A parsed poll with its options and, where present, vote counts. */
export interface ParsedPoll {
  readonly question: string;
  readonly options: readonly { readonly text: string; readonly votes: number | null }[];
}

/** A parsed shared-location message. */
export interface ParsedLocation {
  readonly lat: number;
  readonly lng: number;
  readonly url: string;
}

/**
 * One parsed message. `seq` is the 0-based order in the source file and is
 * the authoritative ordering; timestamps may repeat or go backwards.
 */
export interface ParsedMessage {
  readonly seq: number;
  /** 1-based line number of the header line in the (normalized) text. */
  readonly sourceLine: number;
  readonly timestamp: LocalDateTime;
  /** Null for system messages, which have no author. */
  readonly author: string | null;
  readonly kind: MessageKind;
  /** Normalized body; markers removed; the caption for media messages. */
  readonly body: string;
  readonly isEdited: boolean;
  readonly attachment: ParsedAttachmentRef | null;
  /** Present only when `kind === 'poll'`. */
  readonly poll: ParsedPoll | null;
  /** Present only when `kind === 'location'`. */
  readonly location: ParsedLocation | null;
}
