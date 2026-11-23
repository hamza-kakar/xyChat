/**
 * Calendar arithmetic for jump to date and search date filters. Days are numbered on the export's wall clock (days since
 * 1970-01-01 treating local time as UTC, the same basis as `ts_key`), so
 * no timezone can move a day.
 */
import type { LocalDateTime } from '../model';
import { MS_PER_SECOND, SECONDS_PER_DAY } from './local-date-time';

/** Milliseconds in one day. */
const MS_PER_DAY = SECONDS_PER_DAY * MS_PER_SECOND;
/** Days in a week. */
export const DAYS_IN_WEEK = 7;
/** ISO weekday number of Sunday (Monday = 1 … Sunday = 7). */
const ISO_SUNDAY = 7;

/** A calendar date without a time of day. */
export interface CalendarDay {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

/** A calendar month. */
export interface CalendarMonth {
  readonly year: number;
  readonly month: number;
}

/**
 * Day number of a date (days since 1970-01-01 on the wall clock).
 *
 * @example
 * dayNumber({ year: 1970, month: 1, day: 2 }); // 1
 */
export function dayNumber(date: CalendarDay): number {
  return Math.floor(Date.UTC(date.year, date.month - 1, date.day) / MS_PER_DAY);
}

/**
 * Day number of a `ts_key` (the inverse of the day's first second).
 *
 * @example
 * dayNumberOfTsKey(86_400 + 5); // 1
 */
export function dayNumberOfTsKey(key: number): number {
  return Math.floor(key / SECONDS_PER_DAY);
}

/**
 * Calendar date of a day number.
 *
 * @example
 * fromDayNumber(1); // { year: 1970, month: 1, day: 2 }
 */
export function fromDayNumber(day: number): CalendarDay {
  const date = new Date(day * MS_PER_DAY);
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

/**
 * First and last `ts_key` second of a day (inclusive range filter).
 *
 * @example
 * dayTsKeyRange(1); // { from: 86400, to: 172799 }
 */
export function dayTsKeyRange(day: number): { readonly from: number; readonly to: number } {
  const from = day * SECONDS_PER_DAY;
  return { from, to: from + SECONDS_PER_DAY - 1 };
}

/** Midnight of a calendar day as a LocalDateTime. */
export function startOfCalendarDay(date: CalendarDay): LocalDateTime {
  return { year: date.year, month: date.month, day: date.day, hour: 0, minute: 0, second: 0 };
}

/** Days in a month (28–31). */
export function daysInMonth(month: CalendarMonth): number {
  return new Date(Date.UTC(month.year, month.month, 0)).getUTCDate();
}

/**
 * The month `offset` months after `month` (negative goes back).
 *
 * @example
 * addMonths({ year: 2026, month: 12 }, 1); // { year: 2027, month: 1 }
 */
export function addMonths(month: CalendarMonth, offset: number): CalendarMonth {
  const date = new Date(Date.UTC(month.year, month.month - 1 + offset, 1));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
}

/** Orders two months; negative when `a` is earlier. */
export function compareMonths(a: CalendarMonth, b: CalendarMonth): number {
  return a.year === b.year ? a.month - b.month : a.year - b.year;
}

/**
 * Weeks of a month for a calendar grid: each week has 7 slots holding a
 * day number, or null for slots outside the month.
 *
 * @param month The month to lay out.
 * @param firstWeekday ISO weekday the week starts on (1 = Monday … 7 = Sunday).
 * @returns Rows of 7 slots.
 */
export function monthGrid(
  month: CalendarMonth,
  firstWeekday: number,
): readonly (readonly (number | null)[])[] {
  const first = dayNumber({ year: month.year, month: month.month, day: 1 });
  const jsWeekday = new Date(first * MS_PER_DAY).getUTCDay();
  const isoWeekday = jsWeekday === 0 ? ISO_SUNDAY : jsWeekday;
  const leading = (isoWeekday - firstWeekday + DAYS_IN_WEEK) % DAYS_IN_WEEK;
  const length = daysInMonth(month);
  const slots: (number | null)[] = [
    ...Array.from({ length: leading }, () => null),
    ...Array.from({ length }, (_unused, index) => first + index),
  ];
  while (slots.length % DAYS_IN_WEEK !== 0) {
    slots.push(null);
  }
  const weeks: (number | null)[][] = [];
  for (let start = 0; start < slots.length; start += DAYS_IN_WEEK) {
    weeks.push(slots.slice(start, start + DAYS_IN_WEEK));
  }
  return weeks;
}
