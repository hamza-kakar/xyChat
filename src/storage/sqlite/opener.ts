/**
 * Single-instance database opener (AGENTS.md §10.1): the
 * Web Locks lifetime lock with dependency-injected collaborators, so the
 * locking semantics are unit-tested against a fake lock manager
 * (opener.test.ts, node project). The sahpool-backed production wiring stays
 * in open.ts — worker-only per ADR 0007.
 */
import { err, ok, type Result } from '../../core/result';
import { migrate } from './migrate';
import { verifyFts5Trigram, type SqliteDatabase } from './db-wrapper';

/** The single navigator.locks key guarding database ownership (§10.1). */
// Kept from the app's earlier name: copies of the old and new builds on
// one origin share this database, so they must keep sharing the lock.
export const INSTANCE_LOCK_NAME = 'wachatback-db';

/** Error codes for database opening. */
export type OpenErrorCode =
  'LOCK_UNAVAILABLE' | 'OPFS_INIT_FAILED' | 'MIGRATION_FAILED' | 'FTS5_UNAVAILABLE';

/** A structured open failure. */
export interface OpenError {
  readonly code: OpenErrorCode;
  /** Engine-provided diagnostic text (logger-only; never user-facing). */
  readonly detail: string;
}

/** Minimal structural lock-manager surface: the lib `LockManager` shape is
 * `any`-typed in strict code, so the opener depends on exactly what it uses
 * (§18.4 test seam). */
export interface InstanceLockManager {
  request<T>(
    name: string,
    options: { readonly ifAvailable: true },
    callback: (lock: { readonly name: string } | null) => Promise<T>,
  ): Promise<T>;
}

/** Injectable opener dependencies (§18.4 test seam): production passes
 * `navigator.locks` and the sahpool opener; tests inject fakes. */
export interface DatabaseOpenerDeps {
  readonly locks: InstanceLockManager;
  readonly openSqlite: () => Promise<SqliteDatabase>;
}

/** Wraps the database so closing it releases the single-instance lock —
 * the lock is held for the CONNECTION lifetime (§10.1). */
function withReleaseOnClose(db: SqliteDatabase, onClosed: () => void): SqliteDatabase {
  return {
    ...db,
    close(): void {
      db.close();
      onClosed();
    },
  };
}

/**
 * Creates the database opener: the single-instance lock is held for the
 * CONNECTION lifetime (§10.1). The lock callback stays pending until the
 * caller closes the returned database, so a second tab's open fails fast
 * with LOCK_UNAVAILABLE.
 *
 * @example
 * const open = createDatabaseOpener({ locks: navigator.locks, openSqlite });
 * const result = await open(); // ok(db) | err({ code: 'LOCK_UNAVAILABLE' })
 */
export function createDatabaseOpener(
  deps: DatabaseOpenerDeps,
): () => Promise<Result<SqliteDatabase, OpenError>> {
  const { locks, openSqlite } = deps;
  return () =>
    new Promise<Result<SqliteDatabase, OpenError>>((resolveOutcome) => {
      let settled = false;
      let releaseLock: (() => void) | null = null;
      const finish = (result: Result<SqliteDatabase, OpenError>): void => {
        if (!settled) {
          settled = true;
          resolveOutcome(result);
        }
      };
      // Resolves only when the connection closes; `await lifetime` below
      // keeps the Web Locks callback pending until then.
      const lifetime = new Promise<void>((release) => {
        releaseLock = release;
      });
      void locks
        .request(INSTANCE_LOCK_NAME, { ifAvailable: true }, async (lock) => {
          if (lock === null) {
            finish(err({ code: 'LOCK_UNAVAILABLE', detail: 'another window owns the database' }));
            return;
          }
          let db: SqliteDatabase;
          try {
            db = await openSqlite();
          } catch (error) {
            finish(err({ code: 'OPFS_INIT_FAILED', detail: String(error) }));
            return;
          }
          try {
            migrate(db);
            verifyFts5Trigram(db);
          } catch (error) {
            db.close();
            releaseLock?.();
            finish(err({ code: 'MIGRATION_FAILED', detail: String(error) }));
            return;
          }
          finish(ok(withReleaseOnClose(db, () => releaseLock?.())));
          await lifetime;
        })
        .catch((error: unknown) => {
          finish(err({ code: 'LOCK_UNAVAILABLE', detail: String(error) }));
        });
    });
}
