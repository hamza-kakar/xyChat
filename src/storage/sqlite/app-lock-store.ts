/**
 * App-lock state in `meta`: the PIN as a PBKDF2-SHA-256
 * hash with its salt, the auto-lock delay, and the failed-attempt counter
 * with its lockout deadline (persisted, so a reload doesn't reset it).
 * The PIN hash never leaves db.worker; callers only learn pass or fail.
 */
import * as v from 'valibot';
import {
  AUTO_LOCK_MINUTES,
  PIN_HASH_ITERATIONS,
  constantTimeEqual,
  lockoutMsAfterFailures,
  type AutoLockMinutes,
} from '../../core/app-lock';
import { deleteMeta, readMetaJson, writeMetaJson } from './meta';
import type { SqliteDatabase } from './open';

const PIN_KEY = 'app_lock_pin';
const AUTO_LOCK_KEY = 'app_lock_auto_minutes';
const FAILURES_KEY = 'app_lock_failures';

const HEX = v.pipe(v.string(), v.regex(/^(?:[0-9a-f]{2}){1,64}$/u));
const PinRecordSchema = v.object({
  salt: HEX,
  hash: HEX,
  iterations: v.pipe(v.number(), v.integer(), v.minValue(1)),
});
const FailuresSchema = v.object({
  count: v.pipe(v.number(), v.integer(), v.minValue(0)),
  lockedUntil: v.pipe(v.number(), v.integer(), v.minValue(0)),
});
const AutoLockSchema = v.picklist(AUTO_LOCK_MINUTES);

/** What the lock screen and Settings need to know. */
export interface LockState {
  readonly hasPin: boolean;
  readonly autoLockMinutes: AutoLockMinutes;
  /** Epoch ms until which attempts are refused, or null. */
  readonly lockedUntil: number | null;
}

/** The outcome of a PIN check (one shape, so it crosses Comlink as-is). */
export interface PinCheck {
  readonly ok: boolean;
  /** Epoch ms until which attempts are refused, or null. */
  readonly lockedUntil: number | null;
}

const PASSED: PinCheck = { ok: true, lockedUntil: null };

/** Crypto and clock, injected so the rules are testable. */
export interface PinDeps {
  readonly derive: (pin: string, salt: Uint8Array, iterations: number) => Promise<Uint8Array>;
  readonly randomSalt: () => Uint8Array;
  readonly now: () => number;
}

/** Most private default: lock as soon as the app is hidden. */
const DEFAULT_AUTO_LOCK: AutoLockMinutes = 0;

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function readFailures(db: SqliteDatabase): v.InferOutput<typeof FailuresSchema> {
  return readMetaJson(db, FAILURES_KEY, FailuresSchema) ?? { count: 0, lockedUntil: 0 };
}

function activeLockout(db: SqliteDatabase, now: number): number | null {
  const { lockedUntil } = readFailures(db);
  return lockedUntil > now ? lockedUntil : null;
}

/**
 * Reads the lock state.
 *
 * @param db The open database.
 * @param now The current epoch ms.
 * @returns Whether a PIN is set, the auto-lock delay and any lockout.
 */
export function readLockState(db: SqliteDatabase, now: number): LockState {
  return {
    hasPin: readMetaJson(db, PIN_KEY, PinRecordSchema) !== null,
    autoLockMinutes: readMetaJson(db, AUTO_LOCK_KEY, AutoLockSchema) ?? DEFAULT_AUTO_LOCK,
    lockedUntil: activeLockout(db, now),
  };
}

/** Records one failed attempt and returns the resulting lockout. */
function recordFailure(db: SqliteDatabase, now: number): number | null {
  const count = readFailures(db).count + 1;
  const lockout = lockoutMsAfterFailures(count);
  const lockedUntil = lockout === 0 ? 0 : now + lockout;
  writeMetaJson(db, FAILURES_KEY, { count, lockedUntil });
  return lockedUntil === 0 ? null : lockedUntil;
}

/**
 * Checks a PIN, counting failures (exponential delay after five).
 *
 * @param db The open database.
 * @param pin The entered PIN.
 * @param deps Key derivation and clock.
 * @returns ok when the PIN matches (or none is set); otherwise the lockout
 *   deadline, if one is active. Attempts during a lockout are refused
 *   without being checked.
 */
export async function verifyPin(db: SqliteDatabase, pin: string, deps: PinDeps): Promise<PinCheck> {
  const record = readMetaJson(db, PIN_KEY, PinRecordSchema);
  if (record === null) {
    return PASSED;
  }
  const blockedUntil = activeLockout(db, deps.now());
  if (blockedUntil !== null) {
    return { ok: false, lockedUntil: blockedUntil };
  }
  const derived = await deps.derive(pin, fromHex(record.salt), record.iterations);
  if (constantTimeEqual(fromHex(record.hash), derived)) {
    deleteMeta(db, FAILURES_KEY);
    return PASSED;
  }
  return { ok: false, lockedUntil: recordFailure(db, deps.now()) };
}

/**
 * Sets, changes or removes the PIN. When a PIN is set, `current` must
 * match it first (a failed match counts like any other attempt).
 *
 * @param db The open database.
 * @param input The current PIN (null when none is set) and the new one
 *   (null to turn the lock off).
 * @param deps Key derivation, salt source and clock.
 * @returns ok, or the failed check of the current PIN.
 */
export async function changePin(
  db: SqliteDatabase,
  input: { readonly current: string | null; readonly next: string | null },
  deps: PinDeps,
): Promise<PinCheck> {
  if (readMetaJson(db, PIN_KEY, PinRecordSchema) !== null) {
    const check = await verifyPin(db, input.current ?? '', deps);
    if (!check.ok) {
      return check;
    }
  }
  if (input.next === null) {
    deleteMeta(db, PIN_KEY);
    deleteMeta(db, FAILURES_KEY);
    return PASSED;
  }
  const salt = deps.randomSalt();
  const hash = await deps.derive(input.next, salt, PIN_HASH_ITERATIONS);
  writeMetaJson(db, PIN_KEY, {
    salt: toHex(salt),
    hash: toHex(hash),
    iterations: PIN_HASH_ITERATIONS,
  });
  deleteMeta(db, FAILURES_KEY);
  return PASSED;
}

/**
 * Stores the auto-lock delay.
 *
 * @param db The open database.
 * @param minutes Minutes of inactivity (0 = immediately).
 */
export function setAutoLockMinutes(db: SqliteDatabase, minutes: AutoLockMinutes): void {
  writeMetaJson(db, AUTO_LOCK_KEY, minutes);
}
