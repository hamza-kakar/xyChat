import { describe, expect, it } from 'vitest';
import { firstWeekday } from './week-start';

describe('firstWeekday', () => {
  it('returns an ISO weekday for real locales', () => {
    for (const locale of ['en-US', 'en-GB', 'ur-PK', 'ar-SA']) {
      const day = firstWeekday(locale);
      expect(day).toBeGreaterThanOrEqual(1);
      expect(day).toBeLessThanOrEqual(7);
    }
  });

  it('falls back to Monday for an invalid tag', () => {
    expect(firstWeekday('not a locale!')).toBe(1);
  });
});
