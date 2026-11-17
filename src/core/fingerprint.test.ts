import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { encodeUtf8, fingerprint, type HashBytes } from './fingerprint';

/** Real SHA-256 via node:crypto, injected like workers would inject subtle. */
const nodeSha256: HashBytes = (bytes) =>
  Promise.resolve(new Uint8Array(createHash('sha256').update(bytes).digest()));

const TUPLE = {
  tsCanonical: '2026-11-17T21:19:03',
  author: 'Sara',
  kind: 'text',
  body: 'ok',
  attachmentFileName: '',
  occurrence: 0,
};

describe('encodeUtf8', () => {
  it('matches TextEncoder output for ASCII, RTL and emoji', () => {
    const samples = ['ok', 'سلام', '\u{1F468}\u200D\u{1F469}\u200D\u{1F467}', 'a\u001Fb'];
    for (const sample of samples) {
      expect(Array.from(encodeUtf8(sample))).toEqual(Array.from(new TextEncoder().encode(sample)));
    }
  });

  it('maps lone surrogates to U+FFFD like TextEncoder', () => {
    const lone = 'a\uD800b';
    expect(Array.from(encodeUtf8(lone))).toEqual(Array.from(new TextEncoder().encode(lone)));
  });
});

describe('fingerprint', () => {
  it('is exactly 32 hex characters', async () => {
    const fp = await fingerprint(TUPLE, nodeSha256);
    expect(fp).toMatch(/^[0-9a-f]{32}$/u);
  });

  it('matches a direct SHA-256 of the tuple string', async () => {
    const tupleString = '2026-11-17T21:19:03\u001FSara\u001Ftext\u001Fok\u001F\u001F0';
    const expected = createHash('sha256').update(tupleString, 'utf8').digest('hex').slice(0, 32);
    expect(await fingerprint(TUPLE, nodeSha256)).toBe(expected);
  });

  it('is deterministic for identical tuples', async () => {
    expect(await fingerprint(TUPLE, nodeSha256)).toBe(await fingerprint(TUPLE, nodeSha256));
  });

  it('differs when any tuple component differs', async () => {
    const base = await fingerprint(TUPLE, nodeSha256);
    const variants = [
      { ...TUPLE, tsCanonical: '2026-11-17T21:19:04' },
      { ...TUPLE, author: null },
      { ...TUPLE, kind: 'media' },
      { ...TUPLE, body: 'ok!' },
      { ...TUPLE, attachmentFileName: 'x.jpg' },
      { ...TUPLE, occurrence: 1 },
    ];
    for (const variant of variants) {
      expect(await fingerprint(variant, nodeSha256)).not.toBe(base);
    }
  });
});
