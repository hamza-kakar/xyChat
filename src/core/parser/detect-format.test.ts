import { describe, expect, it } from 'vitest';
import { detectFormat } from './index';

/** Builds an iOS DMY 12h seconds export. */
const IOS_DMY = [
  '[17/11/2026, 9:19:03\u202FPM] Ali Khan: Hello there',
  '[17/11/2026, 9:19:30\u202FPM] Sara: line one',
  '[18/11/2026, 8:00:00\u202FAM] Ali Khan: morning',
].join('\n');

/** Builds an iOS MDY export (second component > 12). */
const IOS_MDY = [
  '[11/17/2026, 9:19:03 PM] Bob: a',
  '[11/18/2026, 8:00:00 AM] Bob: b',
  '[11/19/2026, 9:00:00 AM] Bob: c',
].join('\n');

/** Builds an Android 24h DMY export. */
const ANDROID_DMY = [
  '17/11/2026, 21:19 - Messages and calls are end-to-end encrypted.',
  '17/11/2026, 21:20 - Ali Khan created group "Family"',
  '17/11/2026, 21:21 - Sara: Hi everyone',
  '17/11/2026, 21:22 - Ali Khan: IMG-20261117-WA0001.jpg (file attached)',
].join('\n');

describe('detectFormat', () => {
  it('detects iOS DMY with 12h clock and seconds', () => {
    const r = detectFormat(IOS_DMY);
    expect(r.ok).toBe(true);
    if (r.ok) {
      const { value } = r;
      expect(value.platform).toBe('ios');
      expect(value.headerPatternId).toBe('ios-bracket');
      expect(value.dateOrder).toBe('DMY');
      expect(value.dateOrderSource).toBe('unambiguous');
      expect(value.clock).toBe('12h');
      expect(value.hasSeconds).toBe(true);
      expect(value.sampleMessages.length).toBe(3);
      expect(value.sampleMessages[0]?.body).toBe('Hello there');
    }
  });

  it('detects MDY when the second component exceeds 12', () => {
    const r = detectFormat(IOS_MDY);
    if (r.ok) {
      expect(r.value.dateOrder).toBe('MDY');
      expect(r.value.dateOrderSource).toBe('unambiguous');
    } else {
      throw new Error('expected ok');
    }
  });

  it('detects YMD when the first component is four digits', () => {
    const text = ['2026/11/17, 21:19 - a', '2026/11/18, 21:20 - b', '2026/11/19, 21:21 - c'].join(
      '\n',
    );
    const r = detectFormat(text);
    if (r.ok) {
      expect(r.value.dateOrder).toBe('YMD');
      expect(r.value.dateOrderSource).toBe('unambiguous');
    } else {
      throw new Error('expected ok');
    }
  });

  it('falls back to the locale hint when ambiguous', () => {
    // All date components <= 12: 03/04/2026.
    const text = [
      '[03/04/2026, 9:19 AM] A: a',
      '[03/05/2026, 9:20 AM] A: b',
      '[03/06/2026, 9:21 AM] A: c',
    ].join('\n');
    const us = detectFormat(text, { localeHint: 'en-US' });
    if (!us.ok) {
      throw new Error('expected ok');
    }
    expect(us.value.dateOrder).toBe('MDY');
    expect(us.value.dateOrderSource).toBe('locale-hint');

    const gb = detectFormat(text, { localeHint: 'en-GB' });
    if (!gb.ok) {
      throw new Error('expected ok');
    }
    expect(gb.value.dateOrder).toBe('DMY');
    expect(gb.value.dateOrderSource).toBe('locale-hint');

    const none = detectFormat(text);
    if (!none.ok) {
      throw new Error('expected ok');
    }
    expect(none.value.dateOrder).toBe('DMY');
    expect(none.value.dateOrderSource).toBe('default');
  });
});

describe('detectFormat rejections and edge cases', () => {
  it('rejects inconsistent date orders', () => {
    const text = [
      '[17/04/2026, 9:19 AM] A: day-first evidence',
      '[04/17/2026, 9:20 AM] A: month-first evidence',
    ].join('\n');
    const r = detectFormat(text);
    expect(r).toEqual({ ok: false, error: { code: 'INCONSISTENT_DATE_ORDER' } });
  });

  it('detects Android and 24h clock without seconds', () => {
    const r = detectFormat(ANDROID_DMY);
    if (!r.ok) {
      throw new Error('expected ok');
    }
    expect(r.value.platform).toBe('android');
    expect(r.value.clock).toBe('24h');
    expect(r.value.hasSeconds).toBe(false);
    expect(r.value.headerPatternId).toBe('android-dash');
    expect(r.value.confidence).toBeGreaterThan(0.9);
  });

  it('rejects text without recognizable headers', () => {
    expect(detectFormat('no headers here at all')).toEqual({
      ok: false,
      error: { code: 'UNRECOGNIZED_FORMAT' },
    });
    expect(detectFormat('')).toEqual({ ok: false, error: { code: 'UNRECOGNIZED_FORMAT' } });
  });

  it('scans only the first 1000 non-empty lines for grammar counting', () => {
    const lines: string[] = [];
    for (let i = 0; i < 1001; i += 1) {
      lines.push(`[17/11/2026, 9:${String(i % 60).padStart(2, '0')} AM] A: m${i}`);
    }
    const r = detectFormat(lines.join('\n'));
    if (!r.ok) {
      throw new Error('expected ok');
    }
    expect(r.value.confidence).toBeGreaterThan(0.9);
    expect(r.value.sampleMessages.length).toBeLessThanOrEqual(20);
  });

  it('accepts a single header in a tiny file', () => {
    const r = detectFormat('[17/11/2026, 9:19 PM] A: only line');
    expect(r.ok).toBe(true);
  });

  it('handles CRLF and BOM input', () => {
    const r = detectFormat(`\uFEFF${IOS_DMY.replace(/\n/g, '\r\n')}`);
    if (!r.ok) {
      throw new Error('expected ok');
    }
    expect(r.value.sampleMessages).toHaveLength(3);
  });
});
