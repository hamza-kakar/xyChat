import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { emojiOnlyCount, isJumboEmoji } from './emoji';

describe('emojiOnlyCount', () => {
  it('counts grapheme clusters as single emoji', () => {
    expect(emojiOnlyCount('👍')).toBe(1);
    expect(emojiOnlyCount('👍🏽')).toBe(1);
    expect(emojiOnlyCount('👨‍👩‍👧‍👦')).toBe(1);
    expect(emojiOnlyCount('🇵🇰')).toBe(1);
    expect(emojiOnlyCount('1️⃣')).toBe(1);
    expect(emojiOnlyCount('❤️')).toBe(1);
    expect(emojiOnlyCount('😀 🎉\n🙏')).toBe(3);
  });

  it('returns 0 for anything with text or for empty input', () => {
    expect(emojiOnlyCount('')).toBe(0);
    expect(emojiOnlyCount('   ')).toBe(0);
    expect(emojiOnlyCount('ok 👍')).toBe(0);
    expect(emojiOnlyCount('1')).toBe(0);
    expect(emojiOnlyCount('#')).toBe(0);
    expect(emojiOnlyCount('سلام 😀')).toBe(0);
  });
});

describe('isJumboEmoji', () => {
  it('enlarges one to three emoji only', () => {
    expect(isJumboEmoji('😀')).toBe(true);
    expect(isJumboEmoji('😀😀😀')).toBe(true);
    expect(isJumboEmoji('😀😀😀😀')).toBe(false);
    expect(isJumboEmoji('hi')).toBe(false);
  });

  it('never throws on arbitrary strings', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'grapheme' }), (text) => {
        const count = emojiOnlyCount(text);
        expect(count).toBeGreaterThanOrEqual(0);
      }),
      { numRuns: 1000 },
    );
  });
});
