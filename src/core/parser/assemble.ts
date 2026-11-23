/**
 * Message assembly. Walks the export line by line:
 * header-shaped lines start messages, everything else is a continuation.
 * Malformed headers become warnings, never crashes; no non-empty line is
 * ever lost (it lands in a body, a consumed marker, or a counted warning).
 */
import { tryCreateLocalDateTime, tsKey, type LocalDateTimeError } from '../dates';
import type { Result } from '../result';
import type { LocalDateTime, ParsedMessage, SourcePlatform } from '../model';
import type { HeaderPatternId } from './pattern-id';
import {
  buildHeaderPatterns,
  extractHeaderMatch,
  meridiemAlternation,
  platformForPattern,
  type RawHeaderMatch,
} from './header-patterns';
import { classifyBody } from './classify';
import { cleanBodyLine, cleanHeaderLine, normalizeNewlines, stripBom } from './normalize';
import type { LocalePatterns } from './locale/types';

/** A parse warning; details carry counts/positions only, never content. */
export interface ParseWarning {
  readonly line: number;
  readonly code:
    | 'ORPHAN_LINES_BEFORE_FIRST_MESSAGE'
    | 'INVALID_DATE'
    | 'INVALID_TIME'
    | 'UNRECOGNIZED_ATTACHMENT_MARKER'
    | 'DECODING_REPLACEMENT_CHARS'
    | 'OUT_OF_ORDER_TIMESTAMP';
  readonly detail: string;
}

/** One event yielded by the assembly iterator. */
export type AssembleEvent =
  | { readonly type: 'message'; readonly message: ParsedMessage }
  | { readonly type: 'warning'; readonly warning: ParseWarning }
  | { readonly type: 'progress'; readonly linesProcessed: number; readonly totalLines: number };

/** Aggregate stats over a completed parse. */
export interface ParseStats {
  readonly lines: number;
  readonly messages: number;
  readonly system: number;
  readonly media: number;
}

/** The generator's return value: everything needed for a ParseResult. */
export interface ParseSummary {
  readonly messages: readonly ParsedMessage[];
  readonly warnings: readonly ParseWarning[];
  readonly participants: readonly string[];
  readonly stats: ParseStats;
}

/** The resolved format pieces assembly needs to interpret lines. */
export interface AssemblyFormat {
  readonly headerPatternId: HeaderPatternId;
  readonly dateOrder: 'DMY' | 'MDY' | 'YMD';
  readonly clock: '12h' | '24h';
  readonly platform: SourcePlatform;
}

/** Lines between progress events. */
const PROGRESS_INTERVAL_LINES = 5_000;
/** Minimum spacing between out-of-order warnings. */
const OUT_OF_ORDER_WARNING_SPACING = 1_000;
/** Largest 2-digit year that still maps into the 2000s. */
const TWO_DIGIT_YEAR_MAX = 99;
/** Base added to 2-digit years. */
const TWO_DIGIT_YEAR_BASE = 2000;
/** Noon, the pivot of 12-hour meridiem conversion. */
const NOON_HOUR = 12;

/** A pending message: its header match plus accumulated continuation lines. */
interface PendingMessage {
  readonly header: RawHeaderMatch;
  readonly sourceLine: number;
  readonly bodyLines: string[];
}

/**
 * Resolves a header match into a wall-clock timestamp under the detected
 * format. 2-digit years map to 2000+yy; meridiems drive 12h conversion
 * regardless of the file-level clock, which handles mixed exports.
 *
 * @returns The timestamp, or the validation error code.
 */
export function resolveTimestamp(
  header: RawHeaderMatch,
  dateOrder: AssemblyFormat['dateOrder'],
): Result<LocalDateTime, LocalDateTimeError> {
  const first = Number(header.date[0]);
  const second = Number(header.date[1]);
  const third = Number(header.date[2]);
  const byOrder: readonly [number, number, number] =
    dateOrder === 'YMD'
      ? [first, second, third]
      : dateOrder === 'DMY'
        ? [third, second, first]
        : [third, first, second];
  const [yearRaw, month, day] = byOrder;
  const year =
    yearRaw >= 0 && yearRaw <= TWO_DIGIT_YEAR_MAX ? TWO_DIGIT_YEAR_BASE + yearRaw : yearRaw;

  let hour = Number(header.hour);
  if (header.meridiem === 'am') {
    hour = hour === NOON_HOUR ? 0 : hour;
  } else if (header.meridiem === 'pm') {
    hour = hour === NOON_HOUR ? NOON_HOUR : hour + NOON_HOUR;
  }

  return tryCreateLocalDateTime({
    year,
    month,
    day,
    hour,
    minute: Number(header.minute),
    second: header.second === null ? 0 : Number(header.second),
  });
}

/** Drains an assembly generator to its final summary, ignoring events. */
export function drainToSummary(generator: Generator<AssembleEvent, ParseSummary>): ParseSummary {
  let stepped = generator.next();
  while (stepped.done !== true) {
    stepped = generator.next();
  }
  return stepped.value;
}

/** Outcome of processing one header-shaped line. */
interface StartOutcome {
  /** True when the sample cap says to stop parsing. */
  readonly stop: boolean;
  /** The message flushed to make room, if any. */
  readonly flushed: ParsedMessage | null;
}

/** Mutable parse state, local to one `assembleMessages` run. */
interface AssemblerState {
  pending: PendingMessage | null;
  readonly messages: ParsedMessage[];
  readonly warnings: ParseWarning[];
  readonly participants: string[];
  readonly seenAuthors: Set<string>;
  orphanCount: number;
  orphanWarningEmitted: boolean;
  systemCount: number;
  mediaCount: number;
  previousTs: number | null;
  lastOutOfOrderLine: number;
}

/** Everything the line handlers need beyond the state itself. */
interface HandlerContext {
  readonly locale: LocalePatterns;
  readonly platform: SourcePlatform;
  readonly dateOrder: AssemblyFormat['dateOrder'];
}

interface StartOptions {
  readonly maxMessages?: number;
}

/** Records a warning with position/count-only detail. */
function warnAt(
  state: AssemblerState,
  line: number,
  code: ParseWarning['code'],
  detail: string,
): void {
  state.warnings.push({ line, code, detail });
}

/** Files a non-header line: continuation when inside a message, else orphan. */
function absorbNonHeaderLine(state: AssemblerState, rawLine: string): void {
  if (state.pending === null) {
    state.orphanCount += 1;
  } else {
    state.pending.bodyLines.push(cleanBodyLine(rawLine));
  }
}

/** Emits the pending message, updating participants and kind counters. */
function flushPending(state: AssemblerState, context: HandlerContext): ParsedMessage | null {
  const pending = state.pending;
  if (pending === null) {
    return null;
  }
  const classified = classifyBody(
    pending.header.rest,
    pending.bodyLines,
    context.locale,
    context.platform,
  );
  const timestamp = resolveTimestamp(pending.header, context.dateOrder);
  // Accepted headers always carry a valid timestamp: invalid ones are
  // downgraded to continuations before they ever become pending.
  /* v8 ignore next 3 */ if (!timestamp.ok) {
    return null;
  }
  const message: ParsedMessage = {
    seq: state.messages.length,
    sourceLine: pending.sourceLine,
    timestamp: timestamp.value,
    author: classified.author,
    kind: classified.kind,
    body: classified.body,
    isEdited: classified.isEdited,
    attachment: classified.attachment,
    poll: classified.poll,
    location: classified.location,
  };
  if (message.kind === 'system') {
    state.systemCount += 1;
  }
  if (message.kind === 'media') {
    state.mediaCount += 1;
  }
  if (classified.author !== null && !state.seenAuthors.has(classified.author)) {
    state.seenAuthors.add(classified.author);
    state.participants.push(classified.author);
  }
  state.messages.push(message);
  state.pending = null;
  return message;
}

/** Warns once for orphans seen before the first accepted message. */
function warnForOrphansOnce(state: AssemblerState, line: number): void {
  if (state.orphanCount > 0 && !state.orphanWarningEmitted) {
    warnAt(state, line, 'ORPHAN_LINES_BEFORE_FIRST_MESSAGE', `${state.orphanCount} lines`);
    state.orphanWarningEmitted = true;
  }
}

/** The header line being started, bundled to keep handler arity small. */
interface HeaderLineInput {
  readonly header: RawHeaderMatch;
  readonly rawLine: string;
  readonly sourceLine: number;
}

/**
 * Starts a new pending message from a header-shaped line: invalid dates and
 * times are downgraded to continuations; accepted headers flush the
 * previous message, record order warnings, and honor the sample cap.
 *
 * @returns True when the sample cap says to stop parsing.
 */
function startMessage(
  state: AssemblerState,
  input: HeaderLineInput,
  context: HandlerContext,
  options: StartOptions,
): StartOutcome {
  const { header, rawLine, sourceLine } = input;
  const resolved = resolveTimestamp(header, context.dateOrder);
  if (!resolved.ok) {
    // Invalid date/time: keep the line as continuation text.
    warnAt(state, sourceLine, resolved.error, `line ${sourceLine}`);
    absorbNonHeaderLine(state, rawLine);
    return { stop: false, flushed: null };
  }
  if (options.maxMessages !== undefined && state.messages.length >= options.maxMessages) {
    // The sample has enough messages; drop the pending header so the final
    // flush adds nothing.
    state.pending = null;
    return { stop: true, flushed: null };
  }
  warnForOrphansOnce(state, sourceLine);
  const flushed = flushPending(state, context);

  const ts = tsKey(resolved.value);
  if (state.previousTs !== null && ts < state.previousTs) {
    if (sourceLine - state.lastOutOfOrderLine >= OUT_OF_ORDER_WARNING_SPACING) {
      warnAt(state, sourceLine, 'OUT_OF_ORDER_TIMESTAMP', `line ${sourceLine}`);
      state.lastOutOfOrderLine = sourceLine;
    }
  }
  state.previousTs = ts;
  state.pending = { header, sourceLine, bodyLines: [] };
  return { stop: false, flushed };
}

/** Builds the grammar set for a locale and picks the requested entry. */
function grammarFor(
  id: HeaderPatternId,
  locale: LocalePatterns,
): ReturnType<typeof buildHeaderPatterns>[number] {
  const alternation = meridiemAlternation(locale.meridiem.am, locale.meridiem.pm);
  const patterns = buildHeaderPatterns(alternation);
  const grammar = patterns.find((pattern) => pattern.id === id);
  /* v8 ignore next 3 -- internal table lookup, ids come from that table */
  if (grammar === undefined) {
    throw new Error(`unknown header grammar: ${id}`);
  }
  return grammar;
}

/**
 * Walks the export and yields messages, warnings and progress; returns the
 * full summary when done. Never throws on any input.
 *
 * @param options.maxMessages Stop after emitting this many messages
 *   (used for the preview sample). Omit for a full parse.
 */
export function* assembleMessages(
  text: string,
  format: AssemblyFormat,
  locale: LocalePatterns,
  options: { readonly maxMessages?: number } = {},
): Generator<AssembleEvent, ParseSummary> {
  const normalized = normalizeNewlines(stripBom(text));
  const lines = normalized.split('\n');
  const totalLines = lines.length;
  const grammar = grammarFor(format.headerPatternId, locale);
  const context = {
    locale,
    platform: platformForPattern(format.headerPatternId),
    dateOrder: format.dateOrder,
  };

  const state: AssemblerState = {
    pending: null,
    messages: [],
    warnings: [],
    participants: [],
    seenAuthors: new Set<string>(),
    orphanCount: 0,
    orphanWarningEmitted: false,
    systemCount: 0,
    mediaCount: 0,
    previousTs: null,
    lastOutOfOrderLine: -OUT_OF_ORDER_WARNING_SPACING,
  };

  for (const [index, rawLine] of lines.entries()) {
    const sourceLine = index + 1;
    const cleaned = cleanHeaderLine(rawLine);
    const match = grammar.matcher.exec(cleaned);

    if (match === null) {
      absorbNonHeaderLine(state, rawLine);
    } else {
      const header = extractHeaderMatch(format.headerPatternId, match, locale.meridiem.am);
      const outcome = startMessage(state, { header, rawLine, sourceLine }, context, options);
      if (outcome.flushed !== null) {
        yield { type: 'message', message: outcome.flushed };
      }
      if (outcome.stop) {
        break;
      }
    }
    if (index > 0 && index % PROGRESS_INTERVAL_LINES === 0) {
      yield { type: 'progress', linesProcessed: index, totalLines };
    }
  }

  const finalMessage = flushPending(state, context);
  if (finalMessage !== null) {
    yield { type: 'message', message: finalMessage };
  }
  if (state.messages.length === 0 && state.orphanCount > 0 && !state.orphanWarningEmitted) {
    state.warnings.push({
      line: 1,
      code: 'ORPHAN_LINES_BEFORE_FIRST_MESSAGE',
      detail: `${state.orphanCount} lines`,
    });
  }

  return {
    messages: state.messages,
    warnings: state.warnings,
    participants: state.participants,
    stats: {
      lines: totalLines,
      messages: state.messages.length,
      system: state.systemCount,
      media: state.mediaCount,
    },
  };
}
