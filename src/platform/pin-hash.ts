/**
 * PIN key derivation: PBKDF2-SHA-256 over the PIN with a
 * random salt, through `crypto.subtle`. Worker-safe (no DOM).
 */
import { PIN_HASH_BYTES, PIN_SALT_BYTES } from '../core/app-lock';

const BITS_PER_BYTE = 8;

/**
 * Derives the PIN hash.
 *
 * @param pin The PIN digits.
 * @param salt The stored random salt.
 * @param iterations PBKDF2 iterations.
 * @returns The derived key bytes.
 */
export async function derivePinHash(
  pin: string,
  salt: Uint8Array,
  iterations: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: new Uint8Array(salt), iterations },
    key,
    PIN_HASH_BYTES * BITS_PER_BYTE,
  );
  return new Uint8Array(bits);
}

/** A fresh random salt for a new PIN. */
export function randomPinSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(PIN_SALT_BYTES));
}
