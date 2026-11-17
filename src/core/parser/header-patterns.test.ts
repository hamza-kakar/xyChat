import { describe, expect, it } from 'vitest';
import { en } from './locale/en';
import {
  buildHeaderPatterns,
  extractHeaderMatch,
  matchHeaderLineUsing,
  meridiemAlternation,
  normalizeMeridiem,
  platformForPattern,
} from './header-patterns';

const alternation = meridiemAlternation(en.meridiem.am, en.meridiem.pm);
const patterns = buildHeaderPatterns(alternation);

/** Matches a cleaned line with the English grammar set. */
function match(line: string) {
  return matchHeaderLineUsing(line, patterns, en.meridiem.am);
}

describe('meridiemAlternation', () => {
  it('escapes dots in locale tokens', () => {
    const alt = meridiemAlternation(['a.m.'], ['p.m.']);
    expect(alt).toContain('a\\.m\\.');
    expect(alt).toContain('p\\.m\\.');
  });
});

describe('normalizeMeridiem', () => {
  it('folds dots, spaces and case', () => {
    expect(normalizeMeridiem('a. m.', en.meridiem.am)).toBe('am');
    expect(normalizeMeridiem('P.M.', en.meridiem.am)).toBe('pm');
    expect(normalizeMeridiem('pm', en.meridiem.am)).toBe('pm');
    expect(normalizeMeridiem('AM', en.meridiem.am)).toBe('am');
  });
});

describe('matchHeaderLine', () => {
  it('matches the iOS bracket grammar with comma and meridiem', () => {
    const m = match('[17/11/2026, 9:19:03 PM] Ali Khan: Hello there');
    expect(m?.patternId).toBe('ios-bracket');
    expect(m?.date).toEqual(['17', '11', '2026']);
    expect(m?.dateSeparator).toBe('/');
    expect(m?.hour).toBe('9');
    expect(m?.minute).toBe('19');
    expect(m?.second).toBe('03');
    expect(m?.meridiem).toBe('pm');
    expect(m?.rest).toBe('Ali Khan: Hello there');
  });

  it('matches the iOS bracket grammar without comma', () => {
    const m = match('[17/11/2026 21:19] Sara: hi');
    expect(m?.patternId).toBe('ios-bracket-nocomma');
    expect(m?.meridiem).toBeNull();
    expect(m?.second).toBeNull();
    expect(m?.rest).toBe('Sara: hi');
  });

  it('matches the Android dash grammar', () => {
    const m = match('17/11/2026, 21:19 - Messages and calls are end-to-end encrypted.');
    expect(m?.patternId).toBe('android-dash');
    expect(m?.rest).toBe('Messages and calls are end-to-end encrypted.');
  });

  it('matches the Android dash grammar with 12h clock', () => {
    const m = match('11/17/26, 9:25 PM - Bob: US-style 12h');
    expect(m?.patternId).toBe('android-dash');
    expect(m?.meridiem).toBe('pm');
    expect(m?.date).toEqual(['11', '17', '26']);
  });

  it('matches the Android dash-nocomma grammar', () => {
    const m = match('17.11.26 21:26 - Anna: dotted date');
    expect(m?.patternId).toBe('android-dash-nocomma');
    expect(m?.dateSeparator).toBe('.');
  });

  it('accepts a narrow nbsp before the meridiem via cleaning', () => {
    const cleaned = '[17/11/2026, 9:19:03\u202FPM] A: hi'.replace('\u202F', ' ');
    const m = match(cleaned);
    expect(m?.meridiem).toBe('pm');
  });
});

describe('matchHeaderLine rejections and platforms', () => {
  it('accepts a.m./p.m. variants', () => {
    expect(match('[17/11/2026, 9:19 a.m.] A: hi')?.meridiem).toBe('am');
    expect(match('[17/11/2026, 9:19 a. m.] A: hi')?.meridiem).toBe('am');
    expect(match('[17/11/2026, 9:19 p.m.] A: hi')?.meridiem).toBe('pm');
  });

  it('rejects non-header lines', () => {
    expect(match('just a message line')).toBeNull();
    expect(match('')).toBeNull();
    expect(match('[not a date] A: hi')).toBeNull();
  });

  it('rejects mixed date separators', () => {
    expect(match('17/11-2026, 21:19 - A: hi')).toBeNull();
  });

  it('maps grammar ids to platforms', () => {
    expect(platformForPattern('ios-bracket')).toBe('ios');
    expect(platformForPattern('android-dash')).toBe('android');
  });

  it('extractHeaderMatch tolerates missing groups', () => {
    const grammar = patterns.find((p) => p.id === 'ios-bracket-nocomma');
    if (grammar === undefined) {
      throw new Error('grammar missing');
    }
    const exec = grammar.matcher.exec('[17/11/2026 21:19] A: hi');
    if (exec === null) {
      throw new Error('no match');
    }
    const m = extractHeaderMatch('ios-bracket-nocomma', exec, en.meridiem.am);
    expect(m.second).toBeNull();
    expect(m.meridiem).toBeNull();
  });
});
