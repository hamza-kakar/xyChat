/**
 * Calendar labels for jump to date (AGENTS.md §12.1, §12.5), with the same
 * UTC-trick as every other date in the app: values are built with
 * `Date.UTC` and formatted with `timeZone: 'UTC'`, so no timezone shifts
 * a day.
 */
import { MS_PER_SECOND, SECONDS_PER_DAY } from './local-date-time';
import { DAYS_IN_WEEK, type CalendarMonth } from './calendar';

/** Milliseconds in one day. */
const MS_PER_DAY = SECONDS_PER_DAY * MS_PER_SECOND;
/** Day number of Monday 1970-01-05, the start of a reference ISO week. */
const REFERENCE_MONDAY_DAY = 4;

/**
 * Month and year heading (e.g. 'November 2026').
 *
 * @example
 * formatMonthYear({ year: 2026, month: 11 }, 'en-US'); // 'November 2026'
 */
export function formatMonthYear(month: CalendarMonth, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(month.year, month.month - 1, 1)));
}

/**
 * Weekday name for an ISO weekday (1 = Monday … 7 = Sunday).
 *
 * @example
 * formatWeekday(7, 'en-US', 'short'); // 'Sun'
 */
export function formatWeekday(
  isoWeekday: number,
  locale: string,
  width: 'narrow' | 'short' | 'long',
): string {
  const offset = (((isoWeekday - 1) % DAYS_IN_WEEK) + DAYS_IN_WEEK) % DAYS_IN_WEEK;
  return new Intl.DateTimeFormat(locale, { weekday: width, timeZone: 'UTC' }).format(
    new Date((REFERENCE_MONDAY_DAY + offset) * MS_PER_DAY),
  );
}

/**
 * Full date of a day number (e.g. 'Tuesday, November 17, 2026').
 *
 * @example
 * formatDayNumber(0, 'en-US'); // 'Thursday, January 1, 1970'
 */
export function formatDayNumber(day: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'full', timeZone: 'UTC' }).format(
    new Date(day * MS_PER_DAY),
  );
}
