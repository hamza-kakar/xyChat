import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { parseVcardName } from './vcard';

describe('parseVcardName', () => {
  it('reads the FN line', () => {
    expect(parseVcardName('BEGIN:VCARD\nVERSION:3.0\nFN:Ali Khan\nEND:VCARD')).toBe('Ali Khan');
  });

  it('accepts parameters, CRLF, lowercase and folded lines', () => {
    expect(parseVcardName('BEGIN:VCARD\r\nfn;CHARSET=UTF-8:Sara\r\n  Malik\r\nEND:VCARD')).toBe(
      'Sara Malik',
    );
  });

  it('unescapes commas, semicolons and backslashes', () => {
    expect(parseVcardName('FN:Khan\\, Ali\\; Jr\\\\')).toBe('Khan, Ali; Jr\\');
  });

  it('skips empty FN values and returns null without one', () => {
    expect(parseVcardName('FN:\nFN:Second')).toBe('Second');
    expect(parseVcardName('BEGIN:VCARD\nN:Khan;Ali\nEND:VCARD')).toBeNull();
    expect(parseVcardName('')).toBeNull();
  });

  it('keeps non-Latin names intact', () => {
    expect(parseVcardName('FN:علی خان')).toBe('علی خان');
  });

  it('never throws on arbitrary input', () => {
    fc.assert(
      fc.property(fc.string(), (text) => {
        const name = parseVcardName(text);
        expect(name === null || name.length > 0).toBe(true);
      }),
      { numRuns: 1000 },
    );
  });
});
