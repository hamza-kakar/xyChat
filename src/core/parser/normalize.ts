/**
 * Input normalization (AGENTS.md §8.3). Applied before anything else touches
 * the export text: BOM and newline normalization first, then character
 * hygiene that differs between header matching and body preservation.
 */

/** BOM character stripped from the start of the text. */
const BOM = '\uFEFF';

/** Left-to-right mark, which iOS exports sprinkle before markers. */
export const LRM = '\u200E';
/** Right-to-left mark. */
export const RLM = '\u200F';

/** Strips a leading BOM if present. */
export function stripBom(text: string): string {
  return text.startsWith(BOM) ? text.slice(BOM.length) : text;
}

/** Normalizes CRLF and lone CR line endings to LF. */
export function normalizeNewlines(text: string): string {
  return text.replace(/\r\n?/g, '\n');
}

/** Narrow no-break space, which iOS exports place before meridiems. */
const NARROW_NO_BREAK_SPACE = '\u202F';
/** No-break space, seen in some Android exports. */
const NO_BREAK_SPACE = '\u00A0';

/** Bidirectional control characters removed from header lines (§8.3). */
const HEADER_BIDI_CHARS = '\u200E\u200F\u202A\u202B\u202C\u202D\u202E\u2066\u2067\u2068\u2069';

/**
 * Produces the header-matching form of a line: leading bidirectional marks
 * removed and non-breaking spaces replaced by plain spaces. Never mutates
 * the body form of the same text.
 *
 * @param line A single line without its newline.
 */
export function cleanHeaderLine(line: string): string {
  let cleaned = line.replace(new RegExp(`^[${HEADER_BIDI_CHARS}]+`, 'u'), '');
  cleaned = cleaned.split(NARROW_NO_BREAK_SPACE).join(' ').split(NO_BREAK_SPACE).join(' ');
  return cleaned;
}

/**
 * Produces the body form of a continuation or body line: a single leading
 * left-to-right mark is removed and everything else is preserved exactly
 * (emoji, RTL text, ZWJ sequences, internal whitespace).
 *
 * @param line A single line without its newline.
 */
export function cleanBodyLine(line: string): string {
  return line.startsWith(LRM) ? line.slice(LRM.length) : line;
}

/**
 * Removes a left-to-right or right-to-left mark that sits directly before a
 * matched marker substring, keeping the marker itself. Used when a locale
 * pattern matched a marker that iOS prefixed with an LRM.
 *
 * @param matched The exact substring matched by a locale pattern.
 */
export function stripMarksBeforeMarker(matched: string): string {
  return matched.replace(
    new RegExp(
      `[${LRM}${RLM}]+(<|image|video|audio|sticker|GIF|document|Contact|Media|This|Voice|Video|Missed)`,
      'u',
    ),
    '$1',
  );
}
