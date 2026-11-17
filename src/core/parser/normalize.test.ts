import { describe, expect, it } from 'vitest';
import {
  cleanBodyLine,
  cleanHeaderLine,
  normalizeNewlines,
  stripBom,
  stripMarksBeforeMarker,
} from './normalize';

describe('normalizeText', () => {
  it('stripBom removes a leading BOM only', () => {
    expect(stripBom('\uFEFFhello')).toBe('hello');
    expect(stripBom('a\uFEFFb')).toBe('a\uFEFFb');
    expect(stripBom('plain')).toBe('plain');
  });

  it('normalizeNewlines converts CRLF and CR to LF', () => {
    expect(normalizeNewlines('a\r\nb\rc\nd')).toBe('a\nb\nc\nd');
  });
});

describe('cleanHeaderLine', () => {
  it('strips leading bidirectional marks', () => {
    expect(cleanHeaderLine('\u200E[17/11/2026, 9:19:03 PM] A: hi')).toBe(
      '[17/11/2026, 9:19:03 PM] A: hi',
    );
    expect(cleanHeaderLine('\u202A17/11/2026')).toBe('17/11/2026');
    expect(cleanHeaderLine('\u2066\u200F17/11/2026')).toBe('17/11/2026');
  });

  it('replaces non-breaking spaces with plain spaces', () => {
    expect(cleanHeaderLine('[17/11/2026, 9:19:03\u202FPM] A: hi')).toBe(
      '[17/11/2026, 9:19:03 PM] A: hi',
    );
    expect(cleanHeaderLine('[17/11/2026,\u00A09:19 PM] A: hi')).toBe('[17/11/2026, 9:19 PM] A: hi');
  });

  it('leaves ordinary lines untouched', () => {
    expect(cleanHeaderLine('just text')).toBe('just text');
  });
});

describe('cleanBodyLine', () => {
  it('strips a single leading LRM', () => {
    expect(cleanBodyLine('\u200E<attached: x.jpg>')).toBe('<attached: x.jpg>');
  });

  it('preserves everything else exactly', () => {
    const rtl = 'سلام ةدحاوة بيط';
    expect(cleanBodyLine(rtl)).toBe(rtl);
    const emoji = 'family: \u{1F468}\u200D\u{1F469}\u200D\u{1F467}';
    expect(cleanBodyLine(emoji)).toBe(emoji);
    const inner = 'a\u200Eb';
    expect(cleanBodyLine(inner)).toBe(inner);
  });
});

describe('stripMarksBeforeMarker', () => {
  it('removes LRM directly before a known marker start', () => {
    expect(stripMarksBeforeMarker('\u200E<attached: x.jpg>')).toBe('<attached: x.jpg>');
    expect(stripMarksBeforeMarker('\u200Fimage omitted')).toBe('image omitted');
    expect(stripMarksBeforeMarker('\u200EThis message was deleted.')).toBe(
      'This message was deleted.',
    );
  });

  it('leaves text without marks untouched', () => {
    expect(stripMarksBeforeMarker('<attached: x.jpg>')).toBe('<attached: x.jpg>');
  });
});
