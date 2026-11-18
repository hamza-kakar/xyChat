/**
 * Export format detection (AGENTS.md §8.4). Counts header-shaped lines per
 * grammar, resolves the date order from evidence across the whole file, and
 * reads clock/seconds from the matched headers. Detection never parses the
 * whole file into messages — only header regex matching.
 */
import { err, ok, type Result } from '../result';
import type { DateOrder, ParsedMessage, SourcePlatform } from '../model';
import {
  buildHeaderPatterns,
  extractHeaderMatch,
  meridiemAlternation,
  platformForPattern,
} from './header-patterns';
import type { HeaderPatternId } from './pattern-id';
import { cleanHeaderLine, normalizeNewlines, stripBom } from './normalize';
import { en } from './locale/en';
import { assembleMessages, drainToSummary, type ParseSummary } from './assemble';

/** Error codes for format detection. */
export type FormatErrorCode = 'UNRECOGNIZED_FORMAT' | 'INCONSISTENT_DATE_ORDER';

/** A detection failure; codes are stable for the UI to map to messages. */
export interface FormatError {
  readonly code: FormatErrorCode;
}

/** Where the date-order decision came from (§8.4 step 4). */
export type DateOrderSource = 'unambiguous' | 'locale-hint' | 'default' | 'user';

/** The detected shape of an export file. */
export interface DetectedFormat {
  readonly platform: SourcePlatform;
  readonly headerPatternId: HeaderPatternId;
  readonly dateOrder: DateOrder;
  readonly dateOrderSource: DateOrderSource;
  readonly clock: '12h' | '24h';
  readonly hasSeconds: boolean;
  /** Share of header-like sample lines matched by the winning grammar. */
  readonly confidence: number;
  /** First parsed messages for the confirm-screen preview (§12.8). */
  readonly sampleMessages: readonly ParsedMessage[];
}

export interface DetectFormatOptions {
  /** BCP-47 tag from `navigator.language`, used for ambiguous date orders. */
  readonly localeHint?: string;
}

/** Sample size for grammar counting (§8.4 step 1). */
const SAMPLE_LINE_COUNT = 1000;
/** Minimum matched headers in a large file to accept a grammar. */
const MIN_MATCHES_LARGE = 3;
/** Minimum matched headers in a tiny file to accept a grammar. */
const MIN_MATCHES_SMALL = 1;
/** Sample messages returned for the confirm screen. */
const SAMPLE_MESSAGE_COUNT = 20;

/** Locales whose convention is month-first when a hint is provided. */
const MONTH_FIRST_HINTS = new Set(['en-US', 'en-PH', 'fil-PH', 'en-CA']);

/** A date component above this in D/M positions proves its role. */
const MAX_DAY_IN_MONTH_POSITION = 12;

/** True when a cleaned line looks header-shaped (§8.4 step 2). */
function isHeaderLike(cleaned: string): boolean {
  const startsDigit = cleaned.startsWith('[') ? /^\[\d/u.test(cleaned) : /^\d/u.test(cleaned);
  return startsDigit;
}

interface HeaderEvidence {
  readonly matches: number;
  readonly headerLikeLines: number;
  readonly hasMeridiem: boolean;
  readonly hasSeconds: boolean;
  readonly dateTriples: readonly (readonly [number, number, number])[];
  readonly fourDigitFirst: boolean;
}

/** Cached grammar set for detection (rebuilt never; locale is fixed v1). */
const DETECTION_PATTERNS = buildHeaderPatterns(meridiemAlternation(en.meridiem.am, en.meridiem.pm));

/** Evidence tallies for all four grammars in one pass. */
interface AllEvidence {
  readonly perGrammar: Record<HeaderPatternId, MutableEvidence>;
}

/** Mutable working tally for one grammar. */
interface MutableEvidence {
  matches: number;
  headerLikeLines: number;
  hasMeridiem: boolean;
  hasSeconds: boolean;
  dateTriples: (readonly [number, number, number])[];
  fourDigitFirst: boolean;
}

/** Fresh tally for one grammar. */
function freshEvidence(): MutableEvidence {
  return {
    matches: 0,
    headerLikeLines: 0,
    hasMeridiem: false,
    hasSeconds: false,
    dateTriples: [],
    fourDigitFirst: false,
  };
}

/**
 * Counts matches and gathers date/clock evidence for all grammars in a
 * single pass over the lines (order scan included when sampleLimit is ∞).
 */
function collectAllEvidence(lines: readonly string[], sampleLimit: number): AllEvidence {
  const perGrammar: Record<HeaderPatternId, MutableEvidence> = {
    'ios-bracket': freshEvidence(),
    'ios-bracket-nocomma': freshEvidence(),
    'android-dash': freshEvidence(),
    'android-dash-nocomma': freshEvidence(),
  };

  let nonEmptySeen = 0;
  for (const rawLine of lines) {
    if (rawLine.trim() === '') {
      continue;
    }
    nonEmptySeen += 1;
    const cleaned = cleanHeaderLine(rawLine);
    if (!isHeaderLike(cleaned)) {
      continue;
    }
    // Every grammar shares the same candidate denominator.
    for (const grammar of DETECTION_PATTERNS) {
      const evidence = perGrammar[grammar.id];
      evidence.headerLikeLines += 1;
      const match = grammar.matcher.exec(cleaned);
      if (match === null) {
        continue;
      }
      evidence.matches += 1;
      const header = extractHeaderMatch(grammar.id, match, en.meridiem.am);
      evidence.hasMeridiem ||= header.meridiem !== null;
      evidence.hasSeconds ||= header.second !== null;
      const first = Number(header.date[0]);
      const second = Number(header.date[1]);
      const third = Number(header.date[2]);
      // All three captures are \d-groups, so they are always finite.
      /* v8 ignore next 3 */
      if (Number.isFinite(first) && Number.isFinite(second) && Number.isFinite(third)) {
        evidence.dateTriples.push([first, second, third]);
      }
      if (/^\d{4}$/u.test(header.date[0])) {
        evidence.fourDigitFirst = true;
      }
    }
    if (nonEmptySeen >= sampleLimit) {
      break;
    }
  }
  return { perGrammar };
}

/** Evidence for one grammar over the lines, in a single-matcher pass. */
function collectEvidenceFor(
  lines: readonly string[],
  sampleLimit: number,
  patternId: HeaderPatternId,
): HeaderEvidence {
  const grammar = DETECTION_PATTERNS.find((g) => g.id === patternId);
  if (grammar === undefined) {
    throw new Error(`unknown header grammar: ${patternId}`);
  }
  const evidence = freshEvidence();
  let nonEmptySeen = 0;
  for (const rawLine of lines) {
    if (rawLine.trim() === '') {
      continue;
    }
    nonEmptySeen += 1;
    const cleaned = cleanHeaderLine(rawLine);
    if (!isHeaderLike(cleaned)) {
      continue;
    }
    evidence.headerLikeLines += 1;
    const match = grammar.matcher.exec(cleaned);
    if (match !== null) {
      evidence.matches += 1;
      const header = extractHeaderMatch(grammar.id, match, en.meridiem.am);
      evidence.hasMeridiem ||= header.meridiem !== null;
      evidence.hasSeconds ||= header.second !== null;
      const first = Number(header.date[0]);
      const second = Number(header.date[1]);
      const third = Number(header.date[2]);
      /* v8 ignore next 3 */
      if (Number.isFinite(first) && Number.isFinite(second) && Number.isFinite(third)) {
        evidence.dateTriples.push([first, second, third]);
      }
      if (/^\d{4}$/u.test(header.date[0])) {
        evidence.fourDigitFirst = true;
      }
    }
    if (nonEmptySeen >= sampleLimit) {
      break;
    }
  }
  return evidence;
}
/**
 * Resolves the date order from gathered evidence (§8.4 step 4). Conflicting
 * day/month evidence across the file is a hard error rather than a guess.
 */
function resolveDateOrder(
  evidence: HeaderEvidence,
  localeHint: string | undefined,
): Result<{ readonly order: DateOrder; readonly source: DateOrderSource }, FormatError> {
  if (evidence.fourDigitFirst) {
    return ok({ order: 'YMD', source: 'unambiguous' });
  }
  const firstOver12 = evidence.dateTriples.some(([first]) => first > MAX_DAY_IN_MONTH_POSITION);
  const secondOver12 = evidence.dateTriples.some(
    ([, second]) => second > MAX_DAY_IN_MONTH_POSITION,
  );
  if (firstOver12 && secondOver12) {
    return err({ code: 'INCONSISTENT_DATE_ORDER' });
  }
  if (firstOver12) {
    return ok({ order: 'DMY', source: 'unambiguous' });
  }
  if (secondOver12) {
    return ok({ order: 'MDY', source: 'unambiguous' });
  }
  if (localeHint !== undefined) {
    // Any explicit hint is recorded as the source; month-first locales pick
    // MDY, everything else keeps DMY (§8.4 step 4).
    const order: DateOrder = MONTH_FIRST_HINTS.has(localeHint) ? 'MDY' : 'DMY';
    return ok({ order, source: 'locale-hint' });
  }
  return ok({ order: 'DMY', source: 'default' });
}

/** Maximum lines scanned for the grammar sample; the rest informs order. */
const FULL_SCAN = Number.POSITIVE_INFINITY;

/** Parses the first messages of an export for the confirm-screen preview. */
function previewSample(
  normalizedText: string,
  assembly: {
    readonly headerPatternId: HeaderPatternId;
    readonly dateOrder: DateOrder;
    readonly clock: '12h' | '24h';
    readonly platform: SourcePlatform;
  },
): ParseSummary {
  return drainToSummary(
    assembleMessages(normalizedText, assembly, en, { maxMessages: SAMPLE_MESSAGE_COUNT }),
  );
}

/**
 * Detects the export format (internal implementation; re-exported by the
 * parser's public index).
 *
 * @param text Raw export text (any newlines/BOM; normalized internally).
 * @param options Optional locale hint for ambiguous date orders.
 * @returns The detected format (including preview messages), or an error.
 */
export function detectFormatInternal(
  text: string,
  options: DetectFormatOptions = {},
): Result<DetectedFormat, FormatError> {
  const normalized = normalizeNewlines(stripBom(text));
  const lines = normalized.split('\n');
  // One pass samples the first 1000 non-empty lines for the grammar vote; a
  // second pass scans everything for the date order (§8.4 steps 2 and 4).
  // Small files — fewer than 3 header-like lines — need only 1 match.
  const sampleEvidence = collectAllEvidence(lines, SAMPLE_LINE_COUNT);
  const candidates = (
    ['ios-bracket', 'ios-bracket-nocomma', 'android-dash', 'android-dash-nocomma'] as const
  )
    .map((id) => ({ id, evidence: sampleEvidence.perGrammar[id] }))
    // Tie-break is table order (§8.4 step 2): stable sort by count desc.
    .sort((a, b) => b.evidence.matches - a.evidence.matches);

  const best = candidates[0];
  const candidateCount = best === undefined ? 0 : best.evidence.headerLikeLines;
  const minMatches = candidateCount < MIN_MATCHES_LARGE ? MIN_MATCHES_SMALL : MIN_MATCHES_LARGE;
  if (best === undefined || best.evidence.matches < minMatches) {
    return err({ code: 'UNRECOGNIZED_FORMAT' });
  }

  // Date order scans all header lines in the file (§8.4 step 4) with the
  // winning grammar only — the vote is already settled.
  const fullEvidence = collectEvidenceFor(lines, FULL_SCAN, best.id);
  const order = resolveDateOrder(fullEvidence, options.localeHint);
  if (!order.ok) {
    return order;
  }

  const platform = platformForPattern(best.id);
  const clock: '12h' | '24h' = fullEvidence.hasMeridiem ? '12h' : '24h';
  const sample = previewSample(normalized, {
    headerPatternId: best.id,
    dateOrder: order.value.order,
    clock,
    platform,
  });

  return ok({
    platform,
    headerPatternId: best.id,
    dateOrder: order.value.order,
    dateOrderSource: order.value.source,
    clock,
    hasSeconds: fullEvidence.hasSeconds,
    confidence:
      /* v8 ignore next 2 -- best always matched, so headerLikeLines > 0 */
      fullEvidence.headerLikeLines === 0
        ? 0
        : best.evidence.matches / best.evidence.headerLikeLines,
    sampleMessages: sample.messages,
  });
}
