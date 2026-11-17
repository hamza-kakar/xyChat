import { describe, expect, it } from 'vitest';
import { formatString } from './format-string';

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
