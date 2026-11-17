/**
 * WhatsApp text-format tokenizer (AGENTS.md §12.5): `*bold*`, `_italic_`,
 * `~strike~`, `` `mono` ``, ```` ```monospace``` ````, `> quote` lines,
 * bullet and numbered lists. The output is an AST of plain-text leaves;
 * rendering (React, never HTML strings) happens in the app layer.
 *
 * Pure, synchronous and total: the tokenizer never throws and never loses
 * text — concatenating the leaves of any AST equals the input minus markers.
 */

/** One styled run of text. */
export type TextSpan =
  | { readonly type: 'text'; readonly text: string }
  | { readonly type: 'bold'; readonly children: readonly TextSpan[] }
  | { readonly type: 'italic'; readonly children: readonly TextSpan[] }
  | { readonly type: 'strike'; readonly children: readonly TextSpan[] }
  | { readonly type: 'mono'; readonly text: string }
  | { readonly type: 'monoblock'; readonly text: string };

/** A full parsed message body. */
export interface TextAst {
  readonly spans: readonly LineSpan[];
}

/** Markers scanned in a single pass. */
const INLINE_MARKERS = ['```', '`', '*', '_', '~'] as const;

/** Longest marker length (the triple-backtick fence). */
const LONGEST_MARKER = 3;

/** Opening marker type for a character sequence, or null. */
function markerType(marker: string): (typeof INLINE_MARKERS)[number] | null {
  return (INLINE_MARKERS as readonly string[]).includes(marker)
    ? (marker as (typeof INLINE_MARKERS)[number])
    : null;
}

/** Finds the earliest marker occurrence at or after `start`. */
function nextMarker(
  text: string,
  start: number,
): { readonly index: number; readonly marker: string } | null {
  let best: { readonly index: number; readonly marker: string } | null = null;
  for (const marker of INLINE_MARKERS) {
    const index = text.indexOf(marker, start);
    if (index >= 0 && (best === null || index < best.index)) {
      best = { index, marker };
    }
  }
  return best;
}

/**
 * Tokenizes inline styles into spans. Mono content is taken verbatim
 * (no nested styling); bold/italic/strike nest recursively.
 *
 * @param text Body text WITHOUT a triple-backtick wrapper (those are peeled
 *   by {@link parseText} first).
 */
function tokenizeInline(text: string): readonly TextSpan[] {
  const spans: TextSpan[] = [];
  let plain = '';
  let index = 0;

  const pushPlain = (): void => {
    if (plain !== '') {
      spans.push({ type: 'text', text: plain });
      plain = '';
    }
  };

  while (index < text.length) {
    const found = nextMarker(text, index);
    if (found === null) {
      plain += text.slice(index);
      break;
    }
    const { index: at, marker } = found;
    const closing = text.indexOf(marker, at + marker.length);
    if (closing < 0) {
      // Unterminated marker: literal text (keep the text before it).
      if (at > index) {
        plain += text.slice(index, at);
      }
      plain += marker;
      index = at + marker.length;
      continue;
    }
    if (at > index) {
      plain += text.slice(index, at);
    }
    const inner = text.slice(at + marker.length, closing);
    pushPlain();
    if (marker === '`') {
      spans.push({ type: 'mono', text: inner });
    } else {
      const childType = markerType(marker);
      const children = tokenizeInline(inner);
      if (childType === '*') {
        spans.push({ type: 'bold', children });
      } else if (childType === '_') {
        spans.push({ type: 'italic', children });
      } else {
        spans.push({ type: 'strike', children });
      }
    }
    index = closing + marker.length;
  }
  pushPlain();
  return spans;
}

/** The line-level constructs the parser recognizes. */
export type LineSpan =
  | { readonly type: 'quote'; readonly spans: readonly TextSpan[] }
  | { readonly type: 'bullet'; readonly spans: readonly TextSpan[] }
  | { readonly type: 'numbered'; readonly number: number; readonly spans: readonly TextSpan[] }
  | { readonly type: 'paragraph'; readonly spans: readonly TextSpan[] };

/** Matches `> ` (also `>`) as a quote prefix. */
const QUOTE_PREFIX = /^> ?/u;
/** Matches a bullet prefix: `- `, `* ` or `• `. */
const BULLET_PREFIX = /^[-*•] /u;
/** Matches a numbered-list prefix and captures the number. */
const NUMBER_PREFIX = /^(\d{1,3})\. /u;

/**
 * Tokenizes a message body into an AST (AGENTS.md §12.5).
 *
 * Line constructs (`>`, `- `, `1. `) are recognized per line; the
 * triple-backtick fence wraps everything until the closing fence verbatim.
 * Inline styles tokenize recursively.
 *
 * @param body The normalized message body.
 * @returns The AST whose leaf concatenation equals the input minus markers.
 * @example
 * parseText('plain *bold* _it_');
 * // { spans: [{ type: 'text', text: 'plain ' }, { type: 'bold', children: [{ type: 'text', text: 'bold' }] }, ...] }
 */
export function parseText(body: string): TextAst {
  const spans: LineSpan[] = [];
  let index = 0;

  while (index <= body.length) {
    const fenceStart = body.indexOf('```', index);
    const upTo = fenceStart < 0 ? body.length : fenceStart;
    pushLines(body.slice(index, upTo), spans);
    if (fenceStart < 0) {
      break;
    }
    const contentStart = fenceStart + LONGEST_MARKER;
    const fenceEnd = body.indexOf('```', contentStart);
    if (fenceEnd < 0) {
      // Unterminated fence: verbatim to the end.
      spans.push({
        type: 'paragraph',
        spans: [{ type: 'monoblock', text: body.slice(contentStart) }],
      });
      break;
    }
    spans.push({
      type: 'paragraph',
      spans: [{ type: 'monoblock', text: body.slice(contentStart, fenceEnd) }],
    });
    index = fenceEnd + LONGEST_MARKER;
  }

  return { spans };
}

/** Tokenizes a segment into lines, preserving the newlines between them. */
function pushLines(segment: string, spans: LineSpan[]): void {
  const lines = segment.split('\n');
  for (const [lineIndex, line] of lines.entries()) {
    spans.push(tokenizeLine(line));
    if (lineIndex < lines.length - 1) {
      spans.push({ type: 'paragraph', spans: [{ type: 'text', text: '\n' }] });
    }
  }
}

/** Tokenizes one line into its line-level construct. */
function tokenizeLine(line: string): LineSpan {
  const quote = QUOTE_PREFIX.exec(line);
  if (quote !== null) {
    return { type: 'quote', spans: tokenizeInline(line.slice(quote[0].length)) };
  }
  const bullet = BULLET_PREFIX.exec(line);
  if (bullet !== null) {
    return { type: 'bullet', spans: tokenizeInline(line.slice(bullet[0].length)) };
  }
  const numbered = NUMBER_PREFIX.exec(line);
  if (numbered !== null) {
    return {
      type: 'numbered',
      number: Number(numbered[1] ?? 0),
      spans: tokenizeInline(line.slice(numbered[0].length)),
    };
  }
  return { type: 'paragraph', spans: tokenizeInline(line) };
}

/** Concatenates all leaf text of an AST (property-test helper). */
export function astLeafText(ast: TextAst): string {
  let out = '';
  const walkInline = (spans: readonly TextSpan[]): void => {
    for (const span of spans) {
      if (span.type === 'text' || span.type === 'mono' || span.type === 'monoblock') {
        out += span.text;
      } else {
        walkInline(span.children);
      }
    }
  };
  const walkLine = (span: LineSpan): void => {
    walkInline(span.spans);
  };
  for (const span of ast.spans) {
    walkLine(span);
  }
  return out;
}
