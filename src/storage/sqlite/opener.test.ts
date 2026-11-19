/**
 * Single-instance lock tests (§10.1, review Major 5): the opener is
 * dependency-injected, so the lifetime-lock semantics run in Node against a
 * fake Web Locks manager — second open fails with LOCK_UNAVAILABLE until the
 * first connection is closed.
 */
import { describe, expect, it } from 'vitest';
import { createDatabaseOpener, type InstanceLockManager } from './opener';
import type { SqliteDatabase } from './db-wrapper';

/** Minimal Web Locks fake with real mutual-exclusion semantics. */
class FakeLockManager implements InstanceLockManager {
  private readonly held = new Map<string, Promise<unknown>>();

  request<T>(
    name: string,
    options: { readonly ifAvailable: true },
    callback: (lock: { readonly name: string } | null) => Promise<T>,
  ): Promise<T> {
    const existing = this.held.get(name);
    if (existing !== undefined) {
      if (options.ifAvailable) {
        // §10.1: ifAvailable resolves the callback with null (no lock).
        return Promise.resolve(callback(null));
      }
      return new Promise<T>(() => {});
    }
    const result = callback({ name });
    this.held.set(name, result);
    void result.catch(() => {}).then(() => {
      if (this.held.get(name) === result) {
        this.held.delete(name);
      }
    });
    return result;
  }
}

/** Stub database whose exec() can be made to fail (migration path). */
function stubDb(failExec: boolean): SqliteDatabase & { readonly closed: () => boolean } {
  let closed = false;
  return {
    exec(sql: string): void {
      if (failExec) {
        throw new Error(`exec failed: ${sql.slice(0, 20)}`);
      }
    },
    selectObjects: () => [],
    run: () => {},
    transaction: <T,>(fn: () => T): T => fn(),
    lastInsertRowId: () => 0,
    close: () => {
      closed = true;
    },
    closed: () => closed,
  };
}

function openerWith(db: SqliteDatabase, locks: InstanceLockManager) {
  return createDatabaseOpener({ locks, openSqlite: () => Promise.resolve(db) });
}

/** Waits one macrotask: like the real Web Locks manager, the fake releases
 * the lock asynchronously, so a same-tick re-request would still see it held. */
async function flushRelease(): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
}

describe('database opener single-instance lock (§10.1)', () => {
  it('fails a second open with LOCK_UNAVAILABLE while the first is open', async () => {
    const locks = new FakeLockManager();
    const first = await openerWith(stubDb(false), locks)();
    expect(first.ok).toBe(true);
    const second = await openerWith(stubDb(false), locks)();
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.error.code).toBe('LOCK_UNAVAILABLE');
    }
  });

  it('releases the lock when the first connection closes', async () => {
    const locks = new FakeLockManager();
    const db = stubDb(false);
    const first = await openerWith(db, locks)();
    expect(first.ok).toBe(true);
    if (first.ok) {
      first.value.close();
    }
    await flushRelease();
    const second = await openerWith(stubDb(false), locks)();
    expect(second.ok).toBe(true);
  });

  it('releases the lock on migration failure so the next open succeeds', async () => {
    const locks = new FakeLockManager();
    const failing = stubDb(true);
    const first = await openerWith(failing, locks)();
    expect(first.ok).toBe(false);
    if (!first.ok) {
      expect(first.error.code).toBe('MIGRATION_FAILED');
    }
    expect(failing.closed()).toBe(true);
    await flushRelease();
    const second = await openerWith(stubDb(false), locks)();
    expect(second.ok).toBe(true);
  });

  it('reports OPFS_INIT_FAILED when the sqlite open itself throws', async () => {
    const locks = new FakeLockManager();
    const opener = createDatabaseOpener({
      locks,
      openSqlite: () => Promise.reject(new Error('no opfs')),
    });
    const result = await opener();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('OPFS_INIT_FAILED');
    }
  });
});
