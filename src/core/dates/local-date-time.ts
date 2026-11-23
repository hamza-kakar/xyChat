/**
 * Local-date-time helpers. Timestamps from exports are
 * wall-clock values with no timezone; every conversion here treats them as if
 * they were UTC so that no timezone ever shifts a displayed time.
 */
import { err, ok, type Result } from '../result';
import type { LocalDateTime } from '../model';

/** Smallest supported 4-digit year for export timestamps. */
export const MIN_YEAR = 2000;
/** Largest supported 4-digit year for export timestamps. */
export const MAX_YEAR = 9999;

/** Lower bound for valid months. */
export const MIN_MONTH = 1;
/** Upper bound for valid months. */
export const MONTHS_IN_YEAR = 12;

/** Lower bound for valid days. */
export const MIN_DAY = 1;
/** Upper bound for valid days. */
export const DAYS_IN_MONTH = 31;

/** Upper bound for hours (exclusive). */
export const HOURS_IN_DAY = 24;
/** Upper bound for minutes/seconds (exclusive). */
export const SECONDS_IN_MINUTE = 60;
/** Upper bound for minutes (exclusive), shared with seconds. */
export const MINUTES_IN_HOUR = 60;

/** Seconds in one day, for day-difference arithmetic. */
export const SECONDS_PER_DAY = 86_400;
/** Milliseconds in one second (Date.UTC returns milliseconds). */
export const MS_PER_SECOND = 1000;

/** Error codes for local-date-time construction. */
export type LocalDateTimeError = 'INVALID_DATE' | 'INVALID_TIME';

/**
 * Validates ranges and creates a {@link LocalDateTime}. Days are checked
 * 1–31 regardless of month: exports may claim impossible dates, and the
 * parser records them as warnings rather than losing the message.
 *
 * @returns `ok` with the value, or `err('INVALID_DATE')` /
 *   `err('INVALID_TIME')` when a component is out of range.
 * @example
 * tryCreateLocalDateTime({ year: 2026, month: 11, day: 17, hour: 21, minute: 19, second: 3 });
 * // ok
 */
export function tryCreateLocalDateTime(parts: {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
}): Result<LocalDateTime, LocalDateTimeError> {
  const { year, month, day, hour, minute, second } = parts;
  if (
    year < MIN_YEAR ||
    year > MAX_YEAR ||
    month < MIN_MONTH ||
    month > MONTHS_IN_YEAR ||
    day < MIN_DAY ||
    day > DAYS_IN_MONTH
  ) {
    return err('INVALID_DATE');
  }
  if (
    hour < 0 ||
    hour >= HOURS_IN_DAY ||
    minute < 0 ||
    minute >= MINUTES_IN_HOUR ||
    second < 0 ||
    second >= SECONDS_IN_MINUTE
  ) {
    return err('INVALID_TIME');
  }
  return ok({ year, month, day, hour, minute, second });
}

/** Digit width when padding a two-digit date/time component. */
const PAD_WIDTH = 2;
/** Digit width when padding a four-digit year. */
const PAD_WIDTH_YEAR = 4;

/**
 * Zero-pads a number to `width` digits (for the canonical string form).
 *
 * @param value Number in 0–99.
 * @param width Target digit count (2–4).
 */
function pad(value: number, width: number): string {
  return String(value).padStart(width, '0');
}

/**
 * Renders the canonical `YYYY-MM-DDTHH:MM:SS` form used for fingerprints and
 * stable ordering.
 *
 * @example
 * canonical({ year: 2026, month: 11, day: 17, hour: 21, minute: 19, second: 3 });
 * // '2026-11-17T21:19:03'
 */
export function canonical(date: LocalDateTime): string {
  return (
    `${pad(date.year, PAD_WIDTH_YEAR)}-${pad(date.month, PAD_WIDTH)}-${pad(date.day, PAD_WIDTH)}` +
    `T${pad(date.hour, PAD_WIDTH)}:${pad(date.minute, PAD_WIDTH)}:${pad(date.second, PAD_WIDTH)}`
  );
}

/**
 * Seconds since 1970-01-01 treating the wall-clock value as if it were UTC
 * (`ts_key` in the schema). Ordering and range filters only — never for
 * display.
 *
 * @example
 * tsKey({ year: 2026, month: 11, day: 17, hour: 21, minute: 19, second: 3 });
 * // 1794950343 (same as Date.UTC(2026, 10, 17, 21, 19, 3) / 1000)
 */
export function tsKey(date: LocalDateTime): number {
  return (
    Date.UTC(date.year, date.month - 1, date.day, date.hour, date.minute, date.second) /
    MS_PER_SECOND
  );
}

/** Orders two local date-times; equal timestamps compare as 0. */
export function compare(a: LocalDateTime, b: LocalDateTime): number {
  return tsKey(a) - tsKey(b);
}

/** Returns true when both values denote the same calendar day. */
export function isSameDay(a: LocalDateTime, b: LocalDateTime): boolean {
  return a.year === b.year && a.month === b.month && a.day === b.day;
}

/** Options accepted by the formatting helpers. */
export interface FormatOptions {
  /** BCP-47 locale tag, e.g. 'en-US'. */
  readonly locale: string;
}

/**
 * Formats the time of day (`h:mm a` or `HH:mm` per locale) using the
 * UTC-trick: the wall-clock fields are rendered through `Date.UTC` with
 * `timeZone: 'UTC'`, so no timezone can shift them.
 *
 * @example
 * formatTime({ year: 2026, month: 11, day: 17, hour: 21, minute: 19, second: 0 }, { locale: 'en-US' });
 * // '9:19 PM'
 */
export function formatTime(date: LocalDateTime, options: FormatOptions): string {
  const formatter = new Intl.DateTimeFormat(options.locale, {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
  });
  return formatter.format(toUtcDate(date));
}

/**
 * Formats the calendar date per locale (e.g. 'Nov 17, 2026'), same UTC-trick
 * as {@link formatTime}.
 */
export function formatDate(date: LocalDateTime, options: FormatOptions): string {
  const formatter = new Intl.DateTimeFormat(options.locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
  return formatter.format(toUtcDate(date));
}

/**
 * Formats date and time together for message meta rows
 * (e.g. 'Nov 17, 2026, 9:19:03 PM' — seconds shown in bubble info).
 */
export function formatDateTime(date: LocalDateTime, options: FormatOptions): string {
  const formatter = new Intl.DateTimeFormat(options.locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    timeZone: 'UTC',
  });
  return formatter.format(toUtcDate(date));
}

/** Builds a `Date` from wall-clock fields via `Date.UTC` (the UTC-trick). */
export function toUtcDate(date: LocalDateTime): Date {
  return new Date(
    Date.UTC(date.year, date.month - 1, date.day, date.hour, date.minute, date.second),
  );
}
