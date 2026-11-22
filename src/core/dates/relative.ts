/**
 * Day-relative labels for the chat list and day separators (AGENTS.md
 * §12.4, §12.5). Wall-clock values only, through the UTC-trick, so no
 * timezone can shift a day boundary. The words "Today"/"Yesterday" come
 * from the caller's i18n table: core holds no UI strings.
 */
import type { LocalDateTime } from '../model';
import {
  formatDate,
  formatTime,
  MS_PER_SECOND,
  SECONDS_PER_DAY,
  toUtcDate,
  type FormatOptions,
} from './local-date-time';

/** Milliseconds in one day. */
const MS_PER_DAY = SECONDS_PER_DAY * MS_PER_SECOND;
/** Weekday labels are shown for dates within the last 7 days. */
const WEEKDAY_LOOKBACK_DAYS = 7;

/** Midnight (wall-clock-as-UTC) timestamp of the given day. */
function startOfDayTs(date: LocalDateTime): number {
  return Date.UTC(date.year, date.month - 1, date.day);
}

/**
 * Whole calendar days from `now` to `date` (negative = in the past).
 *
 * @example
 * dayDifference({ ...d, day: 16 }, { ...d, day: 17 }); // -1
 */
export function dayDifference(date: LocalDateTime, now: LocalDateTime): number {
  return Math.round((startOfDayTs(date) - startOfDayTs(now)) / MS_PER_DAY);
}

/** True when `date` falls within the six days before `now`'s day. */
function isWithinLastWeek(diffDays: number): boolean {
  return diffDays > -WEEKDAY_LOOKBACK_DAYS && diffDays < 0;
}

/** Long weekday name per locale (UTC-trick). */
function formatWeekday(date: LocalDateTime, options: FormatOptions): string {
  return new Intl.DateTimeFormat(options.locale, { weekday: 'long', timeZone: 'UTC' }).format(
    toUtcDate(date),
  );
}

/** Words supplied by the app's i18n table. */
export interface RelativeDayLabels {
  readonly today: string;
  readonly yesterday: string;
}

/**
 * The day-separator label (§12.5): today, yesterday, a weekday within the
 * last week, otherwise a locale date.
 *
 * @param date The message's wall-clock time.
 * @param now The device's wall-clock "now".
 * @param options Locale plus the localized today/yesterday words.
 * @returns The label to show in the separator pill.
 */
export function formatDaySeparator(
  date: LocalDateTime,
  now: LocalDateTime,
  options: FormatOptions & { readonly labels: RelativeDayLabels },
): string {
  const diffDays = dayDifference(date, now);
  if (diffDays === 0) {
    return options.labels.today;
  }
  if (diffDays === -1) {
    return options.labels.yesterday;
  }
  return isWithinLastWeek(diffDays) ? formatWeekday(date, options) : formatDate(date, options);
}

/**
 * The chat-list date (§12.4): today → time; this week → weekday; else a
 * short date.
 *
 * @param date The last message's wall-clock time.
 * @param now The device's wall-clock "now".
 * @param options The display locale.
 * @returns The label for the chat row.
 */
export function formatListStamp(
  date: LocalDateTime,
  now: LocalDateTime,
  options: FormatOptions,
): string {
  const diffDays = dayDifference(date, now);
  if (diffDays === 0) {
    return formatTime(date, options);
  }
  return isWithinLastWeek(diffDays) ? formatWeekday(date, options) : formatDate(date, options);
}

/**
 * Rebuilds the wall-clock fields from a `ts_key` (seconds treating the
 * local time as UTC), the inverse of `tsKey`.
 *
 * @example
 * fromTsKey(1794950343); // { year: 2026, month: 11, day: 17, hour: 21, minute: 19, second: 3 }
 */
export function fromTsKey(key: number): LocalDateTime {
  const date = new Date(key * MS_PER_SECOND);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    hour: date.getUTCHours(),
    minute: date.getUTCMinutes(),
    second: date.getUTCSeconds(),
  };
}
