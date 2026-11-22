/**
 * Contact-card name extraction (AGENTS.md §12.5): reads the `FN:` line of
 * a `.vcf` file. Only the display name is taken; nothing else in the card
 * is interpreted. Callers cap the input size (IMPORT_LIMITS.maxVcfBytes)
 * before decoding.
 */

/** `FN` with optional parameters (`FN;CHARSET=UTF-8:`), case-insensitive. */
const FN_LINE = /^FN(?:;[^:\r\n]*)?:(.*)$/iu;

/** vCard escapes: `\,` `\;` `\\` and `\n`. */
const ESCAPE = /\\([,;\\nN])/gu;

/** Joins RFC 6350 folded lines (a line starting with space or tab continues). */
function unfold(text: string): string {
  return text.replace(/\r?\n[ \t]/gu, '');
}

/**
 * Extracts the formatted name from a vCard.
 *
 * @param text The decoded `.vcf` text.
 * @returns The first non-empty `FN` value, unescaped and trimmed, or null.
 * @example
 * parseVcardName('BEGIN:VCARD\nFN:Ali Khan\nEND:VCARD'); // 'Ali Khan'
 */
export function parseVcardName(text: string): string | null {
  for (const line of unfold(text).split(/\r?\n/u)) {
    const match = FN_LINE.exec(line);
    const raw = match?.[1];
    if (raw === undefined) {
      continue;
    }
    const value = raw
      .replace(ESCAPE, (_whole, char: string) => (char === 'n' || char === 'N' ? ' ' : char))
      .trim();
    if (value !== '') {
      return value;
    }
  }
  return null;
}
