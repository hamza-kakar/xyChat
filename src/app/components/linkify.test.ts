import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { extractLinks, splitLinks } from './linkify';

const joined = (text: string): string =>
  splitLinks(text)
    .map((segment) => segment.text)
    .join('');

describe('splitLinks', () => {
  it('links http and https, but leaves bare domains as text', () => {
    expect(splitLinks('see https://example.com/a?b=1 now')).toEqual([
      { kind: 'text', text: 'see ' },
      { kind: 'link', text: 'https://example.com/a?b=1', href: 'https://example.com/a?b=1' },
      { kind: 'text', text: ' now' },
    ]);
    expect(splitLinks('example.org')).toEqual([{ kind: 'text', text: 'example.org' }]);
  });

  it('links emails as mailto and explicit tel links only', () => {
    expect(splitLinks('a@example.com')[0]).toMatchObject({ href: 'mailto:a@example.com' });
    expect(splitLinks('tel:+923001234567')[0]).toMatchObject({ href: 'tel:+923001234567' });
    expect(splitLinks('call +92 300 1234567')).toEqual([
      { kind: 'text', text: 'call +92 300 1234567' },
    ]);
  });

  it('never links other schemes', () => {
    for (const text of [
      'javascript:alert(1)',
      'ftp://example.com/x',
      '//example.com/x',
      'data:text/html,hi',
    ]) {
      expect(splitLinks(text).every((segment) => segment.kind === 'text')).toBe(true);
    }
  });

  it('keeps text exactly, including RTL and emoji around links', () => {
    const text = 'سلام https://example.com 👍🏽';
    expect(joined(text)).toBe(text);
    expect(splitLinks(text).filter((segment) => segment.kind === 'link')).toHaveLength(1);
  });

  it('loses no text for arbitrary input', () => {
    fc.assert(
      fc.property(fc.string(), (text) => {
        expect(joined(text)).toBe(text);
      }),
      { numRuns: 1000 },
    );
  });
});

describe('extractLinks (Links tab)', () => {
  it('lists allowed links once each, in order', () => {
    expect(
      extractLinks(
        'see https://example.com/a, mailto:sara@example.com and https://example.com/a again javascript:alert(1)',
      ),
    ).toEqual([
      { href: 'https://example.com/a', text: 'https://example.com/a' },
      { href: 'mailto:sara@example.com', text: 'mailto:sara@example.com' },
    ]);
    expect(extractLinks('no links, example.com stays text')).toEqual([]);
  });
});
