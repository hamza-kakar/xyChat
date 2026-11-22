import { describe, expect, it } from 'vitest';
import { derivePinHash, randomPinSalt } from './pin-hash';

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

describe('derivePinHash', () => {
  it('computes PBKDF2-SHA-256 (published test vector)', async () => {
    const salt = new TextEncoder().encode('salt');
    expect(hex(await derivePinHash('password', salt, 1))).toBe(
      '120fb6cffcf8b32c43e7225256c4f837a86548c92ccc35480805987cb70be17b',
    );
    expect(hex(await derivePinHash('password', salt, 2))).toBe(
      'ae4d0c95af6b46d32d0adff928f06dd02a303f8ef3c251dfd6e2d85a95474c43',
    );
  });
});

describe('randomPinSalt', () => {
  it('returns 16 fresh random bytes', () => {
    const first = randomPinSalt();
    expect(first).toHaveLength(16);
    expect(hex(first)).not.toBe(hex(randomPinSalt()));
  });
});
