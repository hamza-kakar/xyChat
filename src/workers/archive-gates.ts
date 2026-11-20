/**
 * Archive entry gates (AGENTS.md §15.2, review Blocker 3): the shared error
 * types and per-entry safety predicates used by both the chat-text scan
 * (archive-reader.ts) and the opened media handle (opened-archive.ts).
 * Leaf module — imported by both, no cycles (§18.2).
 */
import { IMPORT_LIMITS } from '../core/limits';

/** Error codes for archive reading (§9.2, §15.2). */
export type ArchiveErrorCode =
  | 'UNSUPPORTED_FILE_TYPE'
  | 'FILE_TOO_LARGE'
  | 'CORRUPT_ARCHIVE'
  | 'ARCHIVE_TOO_LARGE'
  | 'ENTRY_TOO_LARGE'
  | 'COMPRESSION_RATIO'
  | 'QUOTA_EXCEEDED'
  | 'PATH_TRAVERSAL'
  | 'TOO_MANY_ENTRIES'
  | 'ENTRY_NOT_FOUND'
  | 'NO_CHAT_TEXT_FOUND';

/** A structured archive-read failure. The detail carries counts and
 * positions only — never file names or raw exception text (§18.7, §15.4). */
export interface ArchiveError {
  readonly code: ArchiveErrorCode;
  readonly detail: string;
}

/** True when the file name ends with an accepted extension. */
export function hasAcceptedExtension(name: string): boolean {
  return name.toLowerCase().endsWith('.zip') || name.toLowerCase().endsWith('.txt');
}

/** Rejects entry names with path traversal, absolute paths, NULs, or
 * backslash separators (§15.2 — non-conformant in zip names and a
 * Windows-style traversal vector; conservative per §0.6). */
export function isSafeEntryName(name: string): boolean {
  if (name.includes('\u0000')) {
    return false;
  }
  if (name.includes('\\')) {
    return false;
  }
  if (name.startsWith('/') || /^[a-zA-Z]:/u.test(name)) {
    return false;
  }
  const segments = name.split('/');
  return segments.every((segment) => segment !== '..' && segment !== '');
}

/** True when an entry's declared sizes exceed the §15.2 bomb ratio. */
export function isBombEntry(entry: {
  readonly compressedSize: number;
  readonly uncompressedSize: number;
}): boolean {
  if (entry.compressedSize <= 0) {
    return false;
  }
  const ratio = entry.uncompressedSize / entry.compressedSize;
  return ratio > IMPORT_LIMITS.maxCompressionRatio;
}

/** True when a media entry declares more bytes than the §15.2 cap. */
export function isOversizedEntry(entry: { readonly uncompressedSize: number }): boolean {
  return entry.uncompressedSize > IMPORT_LIMITS.maxMediaEntryBytes;
}
