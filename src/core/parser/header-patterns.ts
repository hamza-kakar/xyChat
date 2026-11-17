/**
 * Header grammars (AGENTS.md §8.4). A header line starts a new message; the
 * table lists the known shapes in detection-priority order. All matchers are
 * anchored and linear-time. Every grammar exposes the same capture layout:
 * groups 1–4 are the date (`d1 sep d2 d3`), 5–7 the time (hour, minute,
 * seconds-optional), 8 an optional meridiem token, 9 the REST of the line.
 */
import type { SourcePlatform } from '../model';
import type { HeaderPatternId } from './pattern-id';

/** A matched header, before date/time validation. */
export interface RawHeaderMatch {
  readonly patternId: HeaderPatternId;
  /** The three numeric date groups, exactly as written. */
  readonly date: readonly [string, string, string];
  /** The separator used between date components ('/', '.' or '-'). */
  readonly dateSeparator: string;
  /** Hour as written (1–12 on 12h clocks, 0–23 on 24h clocks). */
  readonly hour: string;
  readonly minute: string;
  /** Seconds as written, or null when the export omits them. */
  readonly second: string | null;
  /** 'am' | 'pm' when a meridiem token was present, else null. */
  readonly meridiem: 'am' | 'pm' | null;
  /** Everything after the header delimiter: the message's first body line. */
  readonly rest: string;
}

/** Digit groups of the date: `d1 sep d2 d3` with an optional trailing dot. */
const DATE = '(\\d{1,4})([./-])(\\d{1,2})\\2(\\d{1,4})\\.?';
/** Time: hour, minutes, optional seconds. Always occupies three groups. */
const TIME = '(\\d{1,2})[.:](\\d{2})(?:[.:](\\d{2}))?';
/** Group offsets shared by every grammar. */
const GROUP_HOUR = 5;
const GROUP_MINUTE = 6;
const GROUP_SECOND = 7;
const GROUP_MERIDIEM = 8;
const GROUP_REST = 9;

interface Grammar {
  readonly id: HeaderPatternId;
  readonly platform: SourcePlatform;
  readonly matcher: RegExp;
}

/** Escapes regex metacharacters in locale-provided meridiem tokens. */
function escapeToken(token: string): string {
  return token.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

/**
 * Builds the meridiem alternation for embedding, longest-first so that
 * 'a. m.' wins over a shorter prefix. Callers wrap it as a group.
 */
export function meridiemAlternation(am: readonly string[], pm: readonly string[]): string {
  const tokens = [...am, ...pm].map(escapeToken);
  tokens.sort((a, b) => b.length - a.length);
  return tokens.join('|');
}

/** Normalizes a matched meridiem token to 'am' or 'pm'. */
export function normalizeMeridiem(token: string, am: readonly string[]): 'am' | 'pm' {
  const folded = token.replace(/[.\s]/gu, '').toLowerCase();
  const isAm = am.some((candidate) => candidate.replace(/[.\s]/gu, '').toLowerCase() === folded);
  return isAm ? 'am' : 'pm';
}

/**
 * Builds the four grammars for one locale's meridiem tokens.
 *
 * @param alternation The escaped meridiem alternation from
 *   {@link meridiemAlternation}.
 */
export function buildHeaderPatterns(alternation: string): readonly Grammar[] {
  const mer = `(?: ?(${alternation}))?`;
  const defs: readonly { readonly id: HeaderPatternId; readonly source: string }[] = [
    { id: 'ios-bracket', source: `^\\[${DATE}, ?${TIME}${mer}\\] (.*)$` },
    { id: 'ios-bracket-nocomma', source: `^\\[${DATE} ${TIME}${mer}\\] (.*)$` },
    { id: 'android-dash', source: `^${DATE}, ?${TIME}${mer} - (.*)$` },
    { id: 'android-dash-nocomma', source: `^${DATE} ${TIME}${mer} - (.*)$` },
  ];
  return defs.map(({ id, source }) => ({
    id,
    platform: id.startsWith('ios') ? ('ios' as const) : ('android' as const),
    matcher: new RegExp(source, 'u'),
  }));
}

/**
 * Extracts a {@link RawHeaderMatch} from a successful matcher result. The
 * caller supplies the AM tokens for the active locale's meridiem folding.
 */
export function extractHeaderMatch(
  id: HeaderPatternId,
  match: RegExpExecArray,
  am: readonly string[],
): RawHeaderMatch {
  const meridiemToken = match[GROUP_MERIDIEM];
  // The `??` fallbacks below are unreachable in practice: every capture
  // group participates on a successful match; only optional groups can be
  // undefined and those are handled explicitly above.
  return {
    patternId: id,
    date: [
      /* v8 ignore next */ match[1] ?? '',
      /* v8 ignore next */ match[3] ?? '',
      /* v8 ignore next */ match[4] ?? '',
    ],
    /* v8 ignore next */ dateSeparator: match[2] ?? '/',
    /* v8 ignore next */ hour: match[GROUP_HOUR] ?? '0',
    /* v8 ignore next */ minute: match[GROUP_MINUTE] ?? '0',
    second: match[GROUP_SECOND] ?? null,
    meridiem: meridiemToken === undefined ? null : normalizeMeridiem(meridiemToken, am),
    /* v8 ignore next */ rest: match[GROUP_REST] ?? '',
  };
}

/** Platform for a grammar id: every ios-* shape is iOS, android-* Android. */
export function platformForPattern(id: HeaderPatternId): SourcePlatform {
  return id.startsWith('ios') ? 'ios' : 'android';
}

/**
 * Attempts to match a cleaned line against a prebuilt grammar set (used by
 * tests and by assembly for its locale-resolved grammars).
 */
export function matchHeaderLineUsing(
  cleanedLine: string,
  patterns: ReturnType<typeof buildHeaderPatterns>,
  am: readonly string[],
): RawHeaderMatch | null {
  for (const pattern of patterns) {
    const match = pattern.matcher.exec(cleanedLine);
    if (match !== null) {
      return extractHeaderMatch(pattern.id, match, am);
    }
  }
  return null;
}

export type { HeaderPatternId };
