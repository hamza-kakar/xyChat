/**
 * Parser public API (AGENTS.md §8.2). `detectFormat` runs before parsing and
 * may be user-adjusted; `parseChat`/`parseChatIterator` consume a format.
 * The parser is pure, synchronous, deterministic and total: it never throws
 * on any input string.
 */
import { ok, type Result } from '../result';
import type { ParsedMessage, SourcePlatform, ClockFormat, DateOrder } from '../model';
import {
  assembleMessages,
  type AssembleEvent,
  type ParseStats,
  type ParseSummary,
  type ParseWarning,
  drainToSummary,
} from './assemble';
import { detectFormatInternal, type FormatError, type DateOrderSource } from './detect-format';
import type { HeaderPatternId } from './pattern-id';
import { PARSER_VERSION } from './version';
import type { LocalePatterns } from './locale/types';
import { en } from './locale/en';

export type { FormatError, FormatErrorCode, DateOrderSource } from './detect-format';
export type {
  ParsedMessage,
  MessageKind,
  MediaType,
  AttachmentStatus,
  ParsedAttachmentRef,
  ParsedPoll,
  ParsedLocation,
  SourcePlatform,
  DateOrder,
  ClockFormat,
  LocalDateTime,
} from '../model';
export type { ParseWarning, ParseStats, ParseSummary };
export type ParseEvent = AssembleEvent;
export { PARSER_VERSION } from './version';

/** The format a parse should run with (possibly user-adjusted). */
export interface DetectedFormat {
  readonly platform: SourcePlatform;
  readonly headerPatternId: HeaderPatternId;
  readonly dateOrder: DateOrder;
  readonly dateOrderSource: DateOrderSource;
  readonly clock: ClockFormat;
  readonly hasSeconds: boolean;
  readonly confidence: number;
  readonly sampleMessages: readonly ParsedMessage[];
}

export interface DetectFormatOptions {
  /** BCP-47 tag from `navigator.language`, used for ambiguous date orders. */
  readonly localeHint?: string;
}

export interface ParseOptions {
  /** The format from `detectFormat` (possibly user-adjusted, §12.8). */
  readonly format: DetectedFormat;
  /** Locale tables to classify with; defaults to the bundled locales. */
  readonly locales?: readonly LocalePatterns[];
}

export interface ParseResult {
  readonly format: DetectedFormat;
  readonly messages: readonly ParsedMessage[];
  /** Distinct authors in first-seen order. */
  readonly participants: readonly string[];
  readonly warnings: readonly ParseWarning[];
  readonly stats: ParseStats;
  readonly parserVersion: string;
}

/** A parse failure; codes are stable for the UI. */
export type ParseErrorCode = 'UNKNOWN_LOCALE';

export interface ParseError {
  readonly code: ParseErrorCode;
}

/**
 * Detects the export format, including preview messages for the
 * confirmation screen.
 *
 * @param text Raw export text (BOM and newlines normalized internally).
 * @param options Optional locale hint for ambiguous date orders.
 * @example
 * const detected = detectFormat(rawText);
 * if (!detected.ok) showError(detected.error.code); // 'UNRECOGNIZED_FORMAT'
 */
export function detectFormat(
  text: string,
  options: DetectFormatOptions = {},
): Result<DetectedFormat, FormatError> {
  return detectFormatInternal(text, options);
}

/** Resolves the locale table for a parse request (bundled set, v1: en). */
function resolveLocale(locales: readonly LocalePatterns[] | undefined): LocalePatterns {
  const first = locales === undefined ? undefined : locales[0];
  return first ?? en;
}

/**
 * Parses an export into messages, participants, warnings and stats.
 *
 * @example
 * const detected = detectFormat(rawText);
 * if (detected.ok) {
 *   const parsed = parseChat(rawText, { format: detected.value });
 *   if (parsed.ok) render(parsed.value.messages);
 * }
 */
export function parseChat(text: string, options: ParseOptions): Result<ParseResult, ParseError> {
  const locale = resolveLocale(options.locales);
  const summary = drainToSummary(assembleMessages(text, toAssemblyFormat(options.format), locale));
  return ok({
    format: options.format,
    messages: summary.messages,
    participants: summary.participants,
    warnings: summary.warnings,
    stats: summary.stats,
    parserVersion: PARSER_VERSION,
  });
}

/**
 * Streaming parse: yields message, warning and progress events, returning
 * the full summary at the end. The format may be user-adjusted before this
 * call (date-order override, §12.8).
 */
export function* parseChatIterator(
  text: string,
  options: ParseOptions,
): Generator<ParseEvent, ParseSummary, unknown> {
  const locale = resolveLocale(options.locales);
  const events = assembleMessages(text, toAssemblyFormat(options.format), locale);
  let stepped = events.next();
  while (stepped.done !== true) {
    yield stepped.value;
    stepped = events.next();
  }
  return stepped.value;
}

/** Simplified alias for the full event union (used in signatures above). */

/** Narrows the public format into the pieces the assembler consumes. */
function toAssemblyFormat(format: DetectedFormat): {
  readonly headerPatternId: HeaderPatternId;
  readonly dateOrder: DateOrder;
  readonly clock: ClockFormat;
  readonly platform: SourcePlatform;
} {
  return {
    headerPatternId: format.headerPatternId,
    dateOrder: format.dateOrder,
    clock: format.clock,
    platform: format.platform,
  };
}
