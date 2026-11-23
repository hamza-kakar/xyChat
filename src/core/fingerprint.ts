/**
 * Message fingerprinting. A fingerprint is the first 32
 * hex characters of SHA-256 over a canonical tuple, with an occurrence
 * counter so legitimately repeated messages (two "ok"s in the same minute)
 * keep distinct identities.
 *
 * `core` stays free of browser APIs: UTF-8 encoding is implemented here in
 * pure TypeScript, and the hash function is injected by the caller (workers
 * use `crypto.subtle`, Node tests use `node:crypto`).
 */

/** Field separator for the fingerprint tuple (unit separator). */
const FIELD_SEPARATOR = '\u001F';
/** Placeholder for a null author in the tuple. */
const NULL_AUTHOR = '\u0000';
/** Length of the hex fingerprint taken from the digest. */
const FINGERPRINT_HEX_LENGTH = 32;
/** Hex digits per byte. */
const HEX_PER_BYTE = 2;
/** Base of hexadecimal output. */
const HEX_BASE = 16;
/** Highest code point fitting in one UTF-8 byte. */
const ASCII_LIMIT = 0x7f;
/** Highest code point fitting in two UTF-8 bytes. */
const TWO_BYTE_LIMIT = 0x7ff;
/** Highest code point fitting in three UTF-8 bytes. */
const THREE_BYTE_LIMIT = 0xffff;
/** Highest code point representable in UTF-8 at all. */
const MAX_CODE_POINT = 0x10ffff;
/** Lowest surrogate value (surrogates are encoded as replacement chars). */
const SURROGATE_START = 0xd800;
/** Highest surrogate value. */
const SURROGATE_END = 0xdfff;
/** Replacement-character code point, used for lone surrogates. */
const REPLACEMENT_CHAR = 0xfffd;

/* UTF-8 byte templates and shift widths (RFC 3629). */
const LEAD_TWO_BYTE = 0xc0;
const LEAD_THREE_BYTE = 0xe0;
const LEAD_FOUR_BYTE = 0xf0;
const CONTINUATION_BYTE = 0x80;
const CONTINUATION_MASK = 0x3f;
const SHIFT_SIX = 6;
const SHIFT_TWELVE = 12;
const SHIFT_EIGHTEEN = 18;

/** A SHA-256 over bytes returning raw digest bytes (async in browsers). */
export type HashBytes = (bytes: Uint8Array) => Promise<Uint8Array>;

/** The identifying tuple a fingerprint is computed from. */
export interface FingerprintInput {
  /** Canonical `YYYY-MM-DDTHH:MM:SS` wall-clock form. */
  readonly tsCanonical: string;
  /** Author name, or null for system messages. */
  readonly author: string | null;
  readonly kind: string;
  readonly body: string;
  /** Attachment file name, or '' when there is none. */
  readonly attachmentFileName: string;
  /** How many earlier messages share the identical tuple. */
  readonly occurrence: number;
}

/** Builds the canonical tuple string for a message identity. */
function tupleString(input: FingerprintInput): string {
  const author = input.author ?? NULL_AUTHOR;
  return [
    input.tsCanonical,
    author,
    input.kind,
    input.body,
    input.attachmentFileName,
    String(input.occurrence),
  ].join(FIELD_SEPARATOR);
}

/**
 * UTF-8 encodes a string in pure TypeScript (no runtime globals), mapping
 * unpaired surrogates to U+FFFD exactly like `TextEncoder` does.
 */
export function encodeUtf8(text: string): Uint8Array {
  const out: number[] = [];
  for (const codePoint of text) {
    let cp = codePoint.codePointAt(0) ?? REPLACEMENT_CHAR;
    if (cp >= SURROGATE_START && cp <= SURROGATE_END) {
      cp = REPLACEMENT_CHAR;
    }
    if (cp <= ASCII_LIMIT) {
      out.push(cp);
    } else if (cp <= TWO_BYTE_LIMIT) {
      out.push(LEAD_TWO_BYTE | (cp >> SHIFT_SIX), CONTINUATION_BYTE | (cp & CONTINUATION_MASK));
    } else if (cp <= THREE_BYTE_LIMIT) {
      out.push(
        LEAD_THREE_BYTE | (cp >> SHIFT_TWELVE),
        CONTINUATION_BYTE | ((cp >> SHIFT_SIX) & CONTINUATION_MASK),
        CONTINUATION_BYTE | (cp & CONTINUATION_MASK),
      );
    } else if (cp <= MAX_CODE_POINT) {
      out.push(
        LEAD_FOUR_BYTE | (cp >> SHIFT_EIGHTEEN),
        CONTINUATION_BYTE | ((cp >> SHIFT_TWELVE) & CONTINUATION_MASK),
        CONTINUATION_BYTE | ((cp >> SHIFT_SIX) & CONTINUATION_MASK),
        CONTINUATION_BYTE | (cp & CONTINUATION_MASK),
      );
    }
  }
  return new Uint8Array(out);
}

/** Converts bytes to lowercase hex. */
function toHex(bytes: Uint8Array): string {
  let hex = '';
  for (const byte of bytes) {
    hex += byte.toString(HEX_BASE).padStart(HEX_PER_BYTE, '0');
  }
  return hex;
}

/**
 * Computes a message fingerprint with the injected hash function.
 *
 * @param input The identifying tuple.
 * @param hashBytes SHA-256 implementation (see `HashBytes`).
 * @returns The first 32 hex characters of the digest.
 * @example
 * const fp = await fingerprint({ tsCanonical: '2026-11-17T21:19:03', author: 'Sara', kind: 'text', body: 'ok', attachmentFileName: '', occurrence: 0 }, hashBytes);
 */
export async function fingerprint(input: FingerprintInput, hashBytes: HashBytes): Promise<string> {
  const bytes = encodeUtf8(tupleString(input));
  const digest = await hashBytes(bytes);
  return toHex(digest).slice(0, FINGERPRINT_HEX_LENGTH);
}
