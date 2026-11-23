/**
 * Link detection for message text: linkify-it tokenizes,
 * and only http, https, mailto and explicit tel links become links.
 * Everything else stays text. Phone numbers and bare domains are never
 * guessed.
 */
import { LinkifyIt } from 'linkify-it';

/** Schemes allowed to render as links. */
const ALLOWED_PROTOCOLS: ReadonlySet<string> = new Set(['http:', 'https:', 'mailto:', 'tel:']);

/** The number after an explicit `tel:` (digits with common separators). */
const TEL_NUMBER = /^\+?\d[\d\-.() ]*\d/u;

/** Bare domains stay text (linkify-it's default), so only explicit links
 * and emails are detected. */
const linkify = new LinkifyIt()
  .add('ftp:', null)
  .add('//', null)
  .add('tel:', {
    validate: (text: string, pos: number): number =>
      TEL_NUMBER.exec(text.slice(pos))?.[0].length ?? 0,
  });

/** A run of plain text or a link. */
export type LinkSegment =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'link'; readonly text: string; readonly href: string };

/** True when the URL parses and uses an allowed scheme. */
function isAllowed(url: string): boolean {
  try {
    return ALLOWED_PROTOCOLS.has(new URL(url).protocol);
  } catch {
    return false;
  }
}

/**
 * Splits text into plain and link segments.
 *
 * @param text A text leaf from the formatting AST.
 * @returns Segments whose concatenated text equals the input.
 */
export function splitLinks(text: string): readonly LinkSegment[] {
  const matches = linkify.match(text) ?? [];
  const segments: LinkSegment[] = [];
  let index = 0;
  for (const match of matches) {
    if (!isAllowed(match.url)) {
      continue;
    }
    if (match.index > index) {
      segments.push({ kind: 'text', text: text.slice(index, match.index) });
    }
    segments.push({ kind: 'link', text: match.raw, href: match.url });
    index = match.lastIndex;
  }
  if (index < text.length) {
    segments.push({ kind: 'text', text: text.slice(index) });
  }
  return segments;
}

/**
 * Every allowed link in a text, in order, without duplicates (Links
 * tab).
 *
 * @param text A message body.
 * @returns The links' targets and their text as written.
 */
export function extractLinks(
  text: string,
): readonly { readonly href: string; readonly text: string }[] {
  const seen = new Set<string>();
  const links: { readonly href: string; readonly text: string }[] = [];
  for (const segment of splitLinks(text)) {
    if (segment.kind === 'link' && !seen.has(segment.href)) {
      seen.add(segment.href);
      links.push({ href: segment.href, text: segment.text });
    }
  }
  return links;
}
