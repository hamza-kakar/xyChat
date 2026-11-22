/**
 * App settings in `meta` (§15.3 app lock, §18.7 persisted logs, §12.9
 * schema version) against real sqlite-wasm and crypto.subtle (ADR 0007).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  changePin,
  readLockState,
  setAutoLockMinutes,
  verifyPin,
  type PinDeps,
} from '../../src/storage/sqlite/app-lock-store';
import {
  readPersistedLogs,
  writePersistedLogs,
  type PersistedLogEntry,
} from '../../src/storage/sqlite/persisted-logs';
import { readSchemaVersion } from '../../src/storage/sqlite/meta';
import { SCHEMA_VERSION } from '../../src/storage/sqlite/migrations';
import { derivePinHash, randomPinSalt } from '../../src/platform/pin-hash';
import { openContractDb } from './contract-helpers';
import type { SqliteDatabase } from '../../src/storage/sqlite/open';

let db: SqliteDatabase;
let clock = 1_000_000;
/** One PBKDF2 round keeps the many checks fast; the real count is
 * covered by the last test. */
const fastDeps: PinDeps = {
  derive: (pin, salt) => derivePinHash(pin, salt, 1),
  randomSalt: randomPinSalt,
  now: () => clock,
};

beforeEach(async () => {
  ({ db } = await openContractDb());
  clock = 1_000_000;
});

afterEach(() => {
  db.close();
});

describe('app lock (§15.3)', () => {
  it('starts unlocked, locking immediately once a PIN is set', async () => {
    expect(readLockState(db, clock)).toEqual({
      hasPin: false,
      autoLockMinutes: 0,
      lockedUntil: null,
    });
    expect(await verifyPin(db, 'anything', fastDeps)).toEqual({ ok: true, lockedUntil: null });

    expect((await changePin(db, { current: null, next: '2468' }, fastDeps)).ok).toBe(true);
    expect(readLockState(db, clock).hasPin).toBe(true);
    expect((await verifyPin(db, '2468', fastDeps)).ok).toBe(true);
    expect((await verifyPin(db, '1357', fastDeps)).ok).toBe(false);
  });

  it('stores only a salted hash, never the PIN', async () => {
    await changePin(db, { current: null, next: '2468' }, fastDeps);
    const stored = String(
      db.selectObjects("SELECT value FROM meta WHERE key = 'app_lock_pin'")[0]?.['value'],
    );
    expect(stored).not.toContain('2468');
    expect(JSON.parse(stored)).toMatchObject({ iterations: 600_000 });
  });

  it('backs off after five failures, refuses attempts meanwhile, and survives a reopen', async () => {
    await changePin(db, { current: null, next: '2468' }, fastDeps);
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      expect(await verifyPin(db, '0000', fastDeps)).toEqual({ ok: false, lockedUntil: null });
    }
    expect(await verifyPin(db, '0000', fastDeps)).toEqual({
      ok: false,
      lockedUntil: clock + 30_000,
    });
    // The right PIN is refused during the lockout, without being checked.
    expect((await verifyPin(db, '2468', fastDeps)).ok).toBe(false);
    expect(readLockState(db, clock).lockedUntil).toBe(clock + 30_000);

    clock += 30_000;
    expect(readLockState(db, clock).lockedUntil).toBeNull();
    expect(await verifyPin(db, '0000', fastDeps)).toEqual({
      ok: false,
      lockedUntil: clock + 60_000,
    });
    clock += 60_000;
    expect((await verifyPin(db, '2468', fastDeps)).ok).toBe(true);
    // Success resets the counter: the next failure is free again.
    expect(await verifyPin(db, '0000', fastDeps)).toEqual({ ok: false, lockedUntil: null });
  });

  it('needs the current PIN to change or remove it', async () => {
    await changePin(db, { current: null, next: '2468' }, fastDeps);
    expect((await changePin(db, { current: '1111', next: '9999' }, fastDeps)).ok).toBe(false);
    expect((await changePin(db, { current: null, next: null }, fastDeps)).ok).toBe(false);
    expect((await changePin(db, { current: '2468', next: '9999' }, fastDeps)).ok).toBe(true);
    expect((await verifyPin(db, '9999', fastDeps)).ok).toBe(true);
    expect((await changePin(db, { current: '9999', next: null }, fastDeps)).ok).toBe(true);
    expect(readLockState(db, clock).hasPin).toBe(false);
  });

  it('stores the auto-lock delay and ignores an invalid stored one', () => {
    setAutoLockMinutes(db, 15);
    expect(readLockState(db, clock).autoLockMinutes).toBe(15);
    db.run("UPDATE meta SET value = '7' WHERE key = 'app_lock_auto_minutes'");
    expect(readLockState(db, clock).autoLockMinutes).toBe(0);
  });

  it('derives with 600,000 PBKDF2 iterations in production', async () => {
    const realDeps: PinDeps = { ...fastDeps, derive: derivePinHash };
    await changePin(db, { current: null, next: '13579' }, realDeps);
    expect((await verifyPin(db, '13579', realDeps)).ok).toBe(true);
    expect((await verifyPin(db, '13578', realDeps)).ok).toBe(false);
  });
});

describe('persisted logs (§18.7)', () => {
  const entry = (code: string): PersistedLogEntry => ({
    timestamp: 1,
    level: 'warn',
    code,
    data: { count: 1 },
  });

  it('keeps the newest 200 entries and clears on an empty list', () => {
    expect(readPersistedLogs(db)).toEqual([]);
    const many = Array.from({ length: 250 }, (_, index) => entry(`code.${String(index)}`));
    writePersistedLogs(db, many);
    const stored = readPersistedLogs(db);
    expect(stored).toHaveLength(200);
    expect(stored[0]?.code).toBe('code.50');
    writePersistedLogs(db, []);
    expect(readPersistedLogs(db)).toEqual([]);
  });

  it('reads a corrupt list as empty', () => {
    db.run('INSERT INTO meta (key, value) VALUES (\'log_entries\', \'[{"level":"debug"}]\')');
    expect(readPersistedLogs(db)).toEqual([]);
  });
});

describe('schema version (§12.9 diagnostics)', () => {
  it('reports the migrated version', () => {
    expect(readSchemaVersion(db)).toBe(SCHEMA_VERSION);
  });
});
