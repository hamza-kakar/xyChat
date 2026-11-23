import { describe, expect, it } from 'vitest';
import { formatCount, formatString } from './format-string';

describe('formatString', () => {
  it('replaces known placeholders', () => {
    expect(formatString('Version {version}', { version: '1.2.3' })).toBe('Version 1.2.3');
  });

  it('replaces multiple placeholders', () => {
    expect(formatString('{a} of {b}', { a: 3, b: 87 })).toBe('3 of 87');
  });

  it('leaves unknown placeholders untouched', () => {
    expect(formatString('Hello {name}', { other: 'x' })).toBe('Hello {name}');
  });

  it('handles a template without placeholders', () => {
    expect(formatString('No placeholders', {})).toBe('No placeholders');
  });
});

describe('formatCount', () => {
  const templates = { one: '{count} file in {where}', other: '{count} files in {where}' };

  it('picks the singular for one and the plural otherwise', () => {
    expect(formatCount(1, templates, { where: 'A' })).toBe('1 file in A');
    expect(formatCount(0, templates, { where: 'A' })).toBe('0 files in A');
    expect(formatCount(2, templates, { where: 'A' })).toBe('2 files in A');
  });
});
