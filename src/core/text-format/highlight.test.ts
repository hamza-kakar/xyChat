import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { splitHighlights } from './highlight';

describe('splitHighlights', () => {
  it('marks every case-insensitive match', () => {
    expect(splitHighlights('Trip to the trip', 'trip')).toEqual([
      { text: 'Trip', isMatch: true },
      { text: ' to the ', isMatch: false },
      { text: 'trip', isMatch: true },
    ]);
  });

  it('treats regex syntax in the query literally', () => {
    expect(splitHighlights('cost (a+b)? yes', '(a+b)?')).toEqual([
      { text: 'cost ', isMatch: false },
      { text: '(a+b)?', isMatch: true },
      { text: ' yes', isMatch: false },
    ]);
  });

  it('returns the text unmarked for blank queries or no match', () => {
    expect(splitHighlights('hello', '  ')).toEqual([{ text: 'hello', isMatch: false }]);
    expect(splitHighlights('hello', 'zz')).toEqual([{ text: 'hello', isMatch: false }]);
    expect(splitHighlights('', 'a')).toEqual([{ text: '', isMatch: false }]);
  });

  it('matches non-Latin scripts and emoji', () => {
    expect(splitHighlights('سلام دوست', 'دوست').at(-1)).toEqual({ text: 'دوست', isMatch: true });
    expect(splitHighlights('ok 👍🏽 ok', '👍🏽')[1]).toEqual({ text: '👍🏽', isMatch: true });
  });

  it('never loses text (property)', () => {
    fc.assert(
      fc.property(fc.string(), fc.string({ maxLength: 4 }), (text, query) => {
        const segments = splitHighlights(text, query);
        expect(segments.map((segment) => segment.text).join('')).toBe(text);
      }),
      { numRuns: 1000 },
    );
  });
});
