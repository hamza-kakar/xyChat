import { describe, expect, it } from 'vitest';
import { err, ok } from '../result';
import {
  canonical,
  compare,
  formatDateTime,
  formatDaySeparator,
  formatDate,
  formatTime,
  isSameDay,
  tsKey,
  tryCreateLocalDateTime,
} from './local-date-time';
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

describe('tryCreateLocalDateTime', () => {
  it('accepts an in-range value', () => {
    expect(
      tryCreateLocalDateTime({ year: 2026, month: 11, day: 17, hour: 21, minute: 19, second: 3 }),
    ).toEqual(ok(T()));
  });

  it('rejects out-of-range date components', () => {
    expect(
      tryCreateLocalDateTime({ year: 2026, month: 13, day: 1, hour: 0, minute: 0, second: 0 }),
    ).toEqual(err('INVALID_DATE'));
    expect(
      tryCreateLocalDateTime({ year: 2026, month: 0, day: 1, hour: 0, minute: 0, second: 0 }),
    ).toEqual(err('INVALID_DATE'));
    expect(
      tryCreateLocalDateTime({ year: 2026, month: 1, day: 32, hour: 0, minute: 0, second: 0 }),
    ).toEqual(err('INVALID_DATE'));
    expect(
      tryCreateLocalDateTime({ year: 1999, month: 1, day: 1, hour: 0, minute: 0, second: 0 }),
    ).toEqual(err('INVALID_DATE'));
  });

  it('rejects out-of-range time components', () => {
    expect(
      tryCreateLocalDateTime({ year: 2026, month: 1, day: 1, hour: 24, minute: 0, second: 0 }),
    ).toEqual(err('INVALID_TIME'));
    expect(
      tryCreateLocalDateTime({ year: 2026, month: 1, day: 1, hour: 0, minute: 60, second: 0 }),
    ).toEqual(err('INVALID_TIME'));
    expect(
      tryCreateLocalDateTime({ year: 2026, month: 1, day: 1, hour: 0, minute: 0, second: 60 }),
    ).toEqual(err('INVALID_TIME'));
  });
});

describe('canonical', () => {
  it('zero-pads every component', () => {
    expect(canonical(T({ month: 2, day: 5, hour: 4, minute: 7, second: 9 }))).toBe(
      '2026-02-05T04:07:09',
    );
  });
});

describe('tsKey and compare', () => {
  it('matches Date.UTC seconds for the same wall-clock fields', () => {
    expect(tsKey(T())).toBe(Date.UTC(2026, 10, 17, 21, 19, 3) / 1000);
  });

  it('orders by wall-clock time', () => {
    const early = T({ hour: 8 });
    const late = T({ hour: 21 });
    expect(compare(early, late)).toBeLessThan(0);
    expect(compare(late, early)).toBeGreaterThan(0);
    expect(compare(early, T({ hour: 8 }))).toBe(0);
  });

  it('orders days before hours', () => {
    const day1 = T({ day: 16, hour: 23 });
    const day2 = T({ day: 17, hour: 1 });
    expect(compare(day1, day2)).toBeLessThan(0);
  });
});

describe('isSameDay', () => {
  it('compares only the calendar day', () => {
    expect(isSameDay(T({ hour: 1 }), T({ hour: 23 }))).toBe(true);
    expect(isSameDay(T({ day: 16 }), T({ day: 17 }))).toBe(false);
  });
});

describe('formatting (UTC-trick)', () => {
  it('formats time per locale without timezone shift', () => {
    expect(formatTime(T(), { locale: 'en-US' })).toBe('9:19 PM');
    expect(formatTime(T(), { locale: 'en-GB' })).toBe('21:19');
  });

  it('formats dates per locale', () => {
    expect(formatDate(T(), { locale: 'en-US' })).toBe('Nov 17, 2026');
    expect(formatDate(T({ month: 1, day: 2 }), { locale: 'en-GB' })).toBe('2 Jan 2026');
  });

  it('formats full date-time with seconds', () => {
    expect(formatDateTime(T(), { locale: 'en-US' })).toBe('Nov 17, 2026, 9:19:03 PM');
  });

  it('labels day separators relative to now', () => {
    const now = T({ day: 17, hour: 10 });
    expect(formatDaySeparator(T({ hour: 1 }), now, { locale: 'en-US' })).toBe('Today');
    expect(formatDaySeparator(T({ day: 16, hour: 1 }), now, { locale: 'en-US' })).toBe('Yesterday');
    // 3 days back: a weekday name (within the last week).
    const threeDaysAgo = T({ day: 14, hour: 1 });
    expect(formatDaySeparator(threeDaysAgo, now, { locale: 'en-US' })).toMatch(
      /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)$/,
    );
    // Older: a locale date.
    expect(formatDaySeparator(T({ day: 1, hour: 1 }), now, { locale: 'en-US' })).toBe(
      'Nov 1, 2026',
    );
  });
});
