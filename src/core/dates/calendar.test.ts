import { describe, expect, it } from 'vitest';
import {
  addMonths,
  compareMonths,
  dayNumber,
  dayNumberOfTsKey,
  daysInMonth,
  dayTsKeyRange,
  fromDayNumber,
  monthGrid,
  startOfCalendarDay,
} from './calendar';
import { tsKey } from './local-date-time';

describe('day numbers', () => {
  it('numbers days on the wall clock and round-trips', () => {
    expect(dayNumber({ year: 1970, month: 1, day: 1 })).toBe(0);
    const day = dayNumber({ year: 2026, month: 11, day: 17 });
    expect(fromDayNumber(day)).toEqual({ year: 2026, month: 11, day: 17 });
    expect(fromDayNumber(dayNumber({ year: 2028, month: 2, day: 29 }))).toEqual({
      year: 2028,
      month: 2,
      day: 29,
    });
  });

  it('maps ts_keys and ranges onto the same days', () => {
    const late = { year: 2026, month: 11, day: 17, hour: 23, minute: 59, second: 59 };
    const day = dayNumber(late);
    expect(dayNumberOfTsKey(tsKey(late))).toBe(day);
    const range = dayTsKeyRange(day);
    expect(range.from).toBe(tsKey(startOfCalendarDay(late)));
    expect(range.to).toBe(tsKey(late));
  });
});

describe('months', () => {
  it('counts days and steps across years', () => {
    expect(daysInMonth({ year: 2026, month: 2 })).toBe(28);
    expect(daysInMonth({ year: 2028, month: 2 })).toBe(29);
    expect(daysInMonth({ year: 2026, month: 12 })).toBe(31);
    expect(addMonths({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
    expect(addMonths({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
    expect(compareMonths({ year: 2026, month: 3 }, { year: 2026, month: 4 })).toBeLessThan(0);
    expect(compareMonths({ year: 2027, month: 1 }, { year: 2026, month: 12 })).toBeGreaterThan(0);
    expect(compareMonths({ year: 2026, month: 5 }, { year: 2026, month: 5 })).toBe(0);
  });

  it('lays out a month grid for Monday- and Sunday-first weeks', () => {
    // November 2026 starts on a Sunday.
    const first = dayNumber({ year: 2026, month: 11, day: 1 });
    const mondayFirst = monthGrid({ year: 2026, month: 11 }, 1);
    expect(mondayFirst[0]).toEqual([null, null, null, null, null, null, first]);
    expect(mondayFirst.every((week) => week.length === 7)).toBe(true);
    const sundayFirst = monthGrid({ year: 2026, month: 11 }, 7);
    expect(sundayFirst[0]?.[0]).toBe(first);
    const days = sundayFirst.flat().filter((slot): slot is number => slot !== null);
    expect(days).toHaveLength(30);
    expect(days.at(-1)).toBe(first + 29);
  });
});
