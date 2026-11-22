/**
 * Search-match highlighting (AGENTS.md §11): splits text into plain and
 * matching segments so the app renders `<mark>` nodes — never HTML
 * strings. Matching is case-insensitive like the FTS trigram index.
 */

/** One run of text, marked when it matches the query. */
export interface HighlightSegment {
  readonly text: string;
  readonly isMatch: boolean;
}

/** Escapes every regex syntax character so the query matches literally. */
function escapeRegExp(raw: string): string {
  return raw.replace(/[\\^$.*+?()[\]{}|/]/gu, (c) => `\\${c}`);
}

/**
 * Splits `text` around every case-insensitive occurrence of `query`.
 * Concatenating the segments always gives back `text`.
 *
 * @param text Text to split (a snippet or message body).
 * @param query The user's search text; empty or blank yields one plain segment.
 * @returns Segments in order.
 *
 * @example
 * splitHighlights('Trip to the trip', 'trip');
 * // [{ text: 'Trip', isMatch: true }, { text: ' to the ', isMatch: false },
 * //  { text: 'trip', isMatch: true }]
 */
export function splitHighlights(text: string, query: string): readonly HighlightSegment[] {
  if (query.trim() === '' || text === '') {
    return [{ text, isMatch: false }];
  }
  const pattern = new RegExp(escapeRegExp(query), 'giu');
  const segments: HighlightSegment[] = [];
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index > last) {
      segments.push({ text: text.slice(last, match.index), isMatch: false });
    }
    segments.push({ text: match[0], isMatch: true });
    last = match.index + match[0].length;
  }
  if (last < text.length || segments.length === 0) {
    segments.push({ text: text.slice(last), isMatch: false });
  }
  return segments;
}
