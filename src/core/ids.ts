/**
 * Branded identifier types. Branding prevents accidental
 * mixing of plain strings with domain IDs at compile time. Raw strings may
 * only be cast to branded types inside this module and in
 * `storage/sqlite/rows.ts`.
 */

declare const brand: unique symbol;

export type Brand<T, B extends string> = T & { readonly [brand]: B };

export type ChatId = Brand<string, 'ChatId'>;
export type ParticipantId = Brand<string, 'ParticipantId'>;
/** A message fingerprint: the first 32 hex characters of a SHA-256 digest. */
export type MessageId = Brand<string, 'MessageId'>;
export type AttachmentId = Brand<string, 'AttachmentId'>;
export type ImportId = Brand<string, 'ImportId'>;
export type BookmarkId = Brand<string, 'BookmarkId'>;

interface RandomUuidSource {
  randomUUID(): string;
}

/**
 * Reads the platform random-UUID source without importing platform-specific
 * type libraries: `core` compiles against ES2023 lib only, so the global
 * `crypto` is reached structurally. Available in all browsers and Node ≥ 19.
 */
function randomUuid(): string {
  const source = (globalThis as { crypto?: RandomUuidSource }).crypto;
  if (source === undefined || typeof source.randomUUID !== 'function') {
    throw new Error('crypto.randomUUID unavailable in this runtime');
  }
  return source.randomUUID();
}

/** Creates a fresh, randomly generated chat identifier. */
export function newChatId(): ChatId {
  return randomUuid() as ChatId;
}

/** Creates a fresh, randomly generated participant identifier. */
export function newParticipantId(): ParticipantId {
  return randomUuid() as ParticipantId;
}

/** Creates a fresh, randomly generated attachment identifier. */
export function newAttachmentId(): AttachmentId {
  return randomUuid() as AttachmentId;
}

/** Creates a fresh, randomly generated import identifier. */
export function newImportId(): ImportId {
  return randomUuid() as ImportId;
}

/** Creates a fresh, randomly generated bookmark identifier. */
export function newBookmarkId(): BookmarkId {
  return randomUuid() as BookmarkId;
}

/**
 * Casts a raw string to a {@link ChatId}. Only for validated reads from the
 * database layer (rows.ts); parser and UI code must never use this.
 */
export function asChatId(raw: string): ChatId {
  return raw as ChatId;
}

/** Casts a raw string to a {@link ParticipantId}; rows.ts only. */
export function asParticipantId(raw: string): ParticipantId {
  return raw as ParticipantId;
}

/** Casts a raw fingerprint hex string to a {@link MessageId}; rows.ts only. */
export function asMessageId(raw: string): MessageId {
  return raw as MessageId;
}

/** Casts a raw string to an {@link AttachmentId}; rows.ts only. */
export function asAttachmentId(raw: string): AttachmentId {
  return raw as AttachmentId;
}

/** Casts a raw string to an {@link ImportId}; rows.ts only. */
export function asImportId(raw: string): ImportId {
  return raw as ImportId;
}

/** Casts a raw string to a {@link BookmarkId}; rows.ts only. */
export function asBookmarkId(raw: string): BookmarkId {
  return raw as BookmarkId;
}
