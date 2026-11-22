/**
 * App-lock rules (AGENTS.md §15.3): PIN shape, the PBKDF2 parameters, the
 * failed-attempt backoff and the constant-time comparison of derived keys.
 * Pure: the key derivation itself is injected by the caller.
 */
import { APP_LOCK } from './limits';

/** PBKDF2-SHA-256 iterations for the PIN hash (§15.3). */
export const PIN_HASH_ITERATIONS = APP_LOCK.pinHashIterations;
/** Salt length in bytes (§15.3). */
export const PIN_SALT_BYTES = APP_LOCK.pinSaltBytes;
/** Derived key length in bytes (SHA-256 output size). */
export const PIN_HASH_BYTES = APP_LOCK.pinHashBytes;
/** Failed attempts allowed before the backoff starts (§15.3). */
export const FREE_PIN_ATTEMPTS = APP_LOCK.freeAttempts;
/** The auto-lock choices offered in Settings (§15.3), in minutes. */
export const AUTO_LOCK_MINUTES = APP_LOCK.autoLockMinutes;
/** Minutes of inactivity before the app locks; 0 means immediately. */
export type AutoLockMinutes = (typeof AUTO_LOCK_MINUTES)[number];

const PIN_PATTERN = /^\d{4,8}$/u;

/**
 * Checks the PIN shape.
 *
 * @param pin The entered PIN.
 * @returns True for 4–8 ASCII digits.
 * @example isValidPin('1234') // true
 */
export function isValidPin(pin: string): boolean {
  return PIN_PATTERN.test(pin);
}

/**
 * How long the lock screen refuses attempts after a failure.
 *
 * @param failures Consecutive failed attempts so far.
 * @returns 0 while free attempts remain, then 30 s, 60 s, 120 s, … capped
 *   at one day.
 * @example lockoutMsAfterFailures(6) // 60_000
 */
export function lockoutMsAfterFailures(failures: number): number {
  if (failures < FREE_PIN_ATTEMPTS) {
    return 0;
  }
  const doublings = failures - FREE_PIN_ATTEMPTS;
  const lockout = APP_LOCK.firstLockoutMs * 2 ** Math.min(doublings, APP_LOCK.maxDoublings);
  return Math.min(lockout, APP_LOCK.maxLockoutMs);
}

/**
 * Compares two byte arrays in time that depends only on their lengths, so
 * a wrong PIN can't be found byte by byte from response times.
 *
 * @param a The stored derived key.
 * @param b The freshly derived key.
 * @returns True when both hold the same bytes.
 */
export function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  let difference = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (a[index] ?? 0) ^ (b[index] ?? 0);
  }
  return difference === 0;
}
