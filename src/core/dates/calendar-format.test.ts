import { describe, expect, it } from 'vitest';
import { formatDayNumber, formatMonthYear, formatWeekday } from './calendar-format';
import { dayNumber } from './calendar';

describe('calendar labels', () => {
  it('formats month headings and weekdays without timezone shifts', () => {
    expect(formatMonthYear({ year: 2026, month: 11 }, 'en-US')).toBe('November 2026');
    expect(formatMonthYear({ year: 2027, month: 1 }, 'en-GB')).toBe('January 2027');
    expect(formatWeekday(1, 'en-US', 'short')).toBe('Mon');
    expect(formatWeekday(7, 'en-US', 'short')).toBe('Sun');
    expect(formatWeekday(3, 'en-US', 'long')).toBe('Wednesday');
  });

  it('formats a full date from a day number', () => {
    expect(formatDayNumber(dayNumber({ year: 2026, month: 11, day: 17 }), 'en-US')).toBe(
      'Tuesday, November 17, 2026',
    );
    expect(formatDayNumber(0, 'en-US')).toBe('Thursday, January 1, 1970');
  });
});
