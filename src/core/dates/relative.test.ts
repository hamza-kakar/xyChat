import { describe, expect, it } from 'vitest';
import { dayDifference, formatDaySeparator, formatListStamp, fromTsKey } from './relative';
import { tsKey } from './local-date-time';
import type { LocalDateTime } from '../model';

const T = (over: Partial<LocalDateTime> = {}): LocalDateTime => ({
  year: 2026,
  month: 11,
  day: 17,
  hour: 21,
  minute: 19,
  second: 3,
  ...over,
});

const labels = { today: 'Today', yesterday: 'Yesterday' };
const WEEKDAY = /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)$/;

describe('dayDifference', () => {
  it('counts calendar days, not 24-hour spans', () => {
    expect(dayDifference(T({ day: 16, hour: 23 }), T({ day: 17, hour: 0 }))).toBe(-1);
    expect(dayDifference(T({ hour: 0 }), T({ hour: 23 }))).toBe(0);
    expect(
      dayDifference(T({ year: 2026, month: 12, day: 31 }), T({ year: 2027, month: 1, day: 1 })),
    ).toBe(-1);
  });
});

describe('formatDaySeparator', () => {
  const now = T({ hour: 10 });

  it('uses the supplied words for today and yesterday', () => {
    expect(formatDaySeparator(T({ hour: 1 }), now, { locale: 'en-US', labels })).toBe('Today');
    expect(formatDaySeparator(T({ day: 16 }), now, { locale: 'en-US', labels })).toBe('Yesterday');
    expect(
      formatDaySeparator(T({ hour: 1 }), now, {
        locale: 'en-US',
        labels: { today: 'Heute', yesterday: 'Gestern' },
      }),
    ).toBe('Heute');
  });

  it('shows a weekday within the last week and a date before that', () => {
    expect(formatDaySeparator(T({ day: 14 }), now, { locale: 'en-US', labels })).toMatch(WEEKDAY);
    expect(formatDaySeparator(T({ day: 11 }), now, { locale: 'en-US', labels })).toMatch(WEEKDAY);
    expect(formatDaySeparator(T({ day: 10 }), now, { locale: 'en-US', labels })).toBe(
      'Nov 10, 2026',
    );
  });

  it('shows a date for days after now (clock skew)', () => {
    expect(formatDaySeparator(T({ day: 18 }), now, { locale: 'en-US', labels })).toBe(
      'Nov 18, 2026',
    );
  });
});

describe('formatListStamp', () => {
  const now = T({ hour: 23 });

  it('shows the time for today', () => {
    expect(formatListStamp(T(), now, { locale: 'en-US' })).toBe('9:19 PM');
    expect(formatListStamp(T(), now, { locale: 'en-GB' })).toBe('21:19');
  });

  it('shows a weekday this week and a date otherwise', () => {
    expect(formatListStamp(T({ day: 16 }), now, { locale: 'en-US' })).toMatch(WEEKDAY);
    expect(formatListStamp(T({ day: 1 }), now, { locale: 'en-US' })).toBe('Nov 1, 2026');
  });
});

describe('fromTsKey', () => {
  it('inverts tsKey', () => {
    const value = T();
    expect(fromTsKey(tsKey(value))).toEqual(value);
    expect(fromTsKey(1794950343)).toEqual(value);
    const leap = T({ year: 2028, month: 2, day: 29, hour: 0, minute: 0, second: 0 });
    expect(fromTsKey(tsKey(leap))).toEqual(leap);
  });
});
