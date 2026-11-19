/**
 * SQLite opening (AGENTS.md §10.1): sqlite-wasm with the opfs-sahpool VFS
 * inside db.worker, behind a small typed wrapper so the repository code
 * never touches the raw C-style API. Only db.worker may call this (layer
 * rules §3.1).
 */
import initSqlite3 from '@sqlite.org/sqlite-wasm';
import type { Database, Sqlite3Static } from '@sqlite.org/sqlite-wasm';
import { err, ok, type Result } from '../../core/result';
import { migrate } from './migrate';

/** Database file name inside the sahpool VFS. */
const DB_FILENAME = '/chatkeep.sqlite3';
/** sahpool metadata directory (fixed; changing it orphans databases). */
const SAHPOOL_DIRECTORY = 'chatkeep-db';
/** VFS name registered by installOpfsSAHPoolVfs (§10.1). */
export const SAHPOOL_VFS_NAME = 'opfs-sahpool';
/** navigator.locks key guarding single-instance ownership (§10.1). */
const INSTANCE_LOCK_NAME = 'wachatback-db';

/** Error codes for database opening. */
export type OpenErrorCode =
  'LOCK_UNAVAILABLE' | 'OPFS_INIT_FAILED' | 'MIGRATION_FAILED' | 'FTS5_UNAVAILABLE';

/** A structured open failure. */
export interface OpenError {
  readonly code: OpenErrorCode;
  /** Engine-provided diagnostic text (logger-only; never user-facing). */
  readonly detail: string;
}

/**
 * Thin typed wrapper over the sqlite3 OO API: the only surface the
 * repository is allowed to use. All statement binding is parameterized —
 * string-concatenated SQL is forbidden (§10.5).
 */
export interface SqliteDatabase {
  /** Executes raw SQL (DDL / pragmas / migrations — never user input). */
  exec(sql: string): void;
  /** Runs a parameterized statement returning rows as objects. */
  selectObjects(
    sql: string,
    params?: readonly (string | number | null)[],
  ): Record<string, unknown>[];
  /** Runs a parameterized statement returning nothing. */
  run(sql: string, params?: readonly (string | number | null)[]): void;
  /** Wraps the callback in BEGIN/COMMIT, rolling back on throw. */
  transaction<T>(fn: () => T): T;
  /** Last inserted rowid. */
  lastInsertRowId(): number;
  /** Closes the connection. */
  close(): void;
}

/** Wraps the sqlite3 OO Database in the repository-facing interface. */
export function wrapDatabase(db: Database): SqliteDatabase {
  return {
    exec(sql: string): void {
      db.exec(sql);
    },
    selectObjects(
      sql: string,
      params?: readonly (string | number | null)[],
    ): Record<string, unknown>[] {
      if (params === undefined) {
        return db.exec({ sql, rowMode: 'object', returnValue: 'resultRows' });
      }
      return db.exec({
        sql,
        bind: [...params],
        rowMode: 'object',
        returnValue: 'resultRows',
      });
    },
    run(sql: string, params?: readonly (string | number | null)[]): void {
      if (params === undefined) {
        db.exec(sql);
        return;
      }
      db.exec({ sql, bind: [...params] });
    },
    transaction<T>(fn: () => T): T {
      db.exec('BEGIN');
      try {
        const result = fn();
        db.exec('COMMIT');
        return result;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
    lastInsertRowId(): number {
      const rows: Record<string, unknown>[] = db.exec({
        sql: 'SELECT last_insert_rowid() AS id',
        rowMode: 'object',
        returnValue: 'resultRows',
      });
      const first = rows[0];
      return typeof first?.['id'] === 'number' ? first['id'] : 0;
    },
    close(): void {
      db.close();
    },
  };
}

/** Internal: perform the actual sahpool-backed open. */
/* v8 ignore next 30 -- SAHPool install requires worker-only OPFS APIs
 * (createSyncAccessHandle); it runs inside db.worker at production boot and
 * is exercised there by every e2e flow. Page-context coverage cannot reach
 * it, per ADR 0007. */
async function openSahpool(): Promise<SqliteDatabase> {
  const sqlite3: Sqlite3Static = await initSqlite3();
  // Registers the opfs-sahpool VFS; the pool util exposes the VFS-backed
  // DB constructor directly.
  const pool = await sqlite3.installOpfsSAHPoolVfs({ directory: SAHPOOL_DIRECTORY });
  // The VFS's own constructor: (filename) — create-if-missing is implied.
  const db = new pool.OpfsSAHPoolDb(DB_FILENAME);
  const wrapped = wrapDatabase(db);
  // §10.1 pragmas: WAL is unsupported by this VFS.
  wrapped.exec(`
    PRAGMA journal_mode=DELETE;
    PRAGMA foreign_keys=ON;
    PRAGMA synchronous=NORMAL;
    PRAGMA temp_store=MEMORY;
    PRAGMA cache_size=-16000;
  `);
  return wrapped;
}

/**
 * Verifies FTS5 with the trigram tokenizer (§10.1, ADR 0008): the
 * capability-gate half of the boot check. Throws when FTS5 is missing —
 * the caller surfaces the failure as a capability error, never silent
 * degradation.
 */
export function verifyFts5Trigram(db: SqliteDatabase): void {
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS temp.fts5_trigram_probe
    USING fts5(x, tokenize='trigram');
    DROP TABLE IF EXISTS temp.fts5_trigram_probe;
  `);
}

/**
 * Opens the database: single-instance lock first (§10.1), then the sahpool
 * VFS, pragmas, migrations, and the FTS5 probe.
 *
 * @returns The opened, migrated database, or a structured failure.
 */
/* v8 ignore next 3 -- same worker-only constraint as openSahpool */
export async function openDatabase(): Promise<Result<SqliteDatabase, OpenError>> {
  // Single instance: if the lock is held, fail fast (§10.1).
  let locked: boolean;
  try {
    locked = await navigator.locks.request(
      INSTANCE_LOCK_NAME,
      { ifAvailable: true },
      (lock) => lock !== null,
    );
  } catch (error) {
    return err({ code: 'LOCK_UNAVAILABLE', detail: String(error) });
  }
  if (!locked) {
    return err({ code: 'LOCK_UNAVAILABLE', detail: 'another window owns the database' });
  }

  try {
    const db = await openSahpool();
    try {
      migrate(db);
      verifyFts5Trigram(db);
      return ok(db);
    } catch (error) {
      db.close();
      return err({ code: 'MIGRATION_FAILED', detail: String(error) });
    }
  } catch (error) {
    return err({ code: 'OPFS_INIT_FAILED', detail: String(error) });
  }
}

/**
 * Runs a callback while holding the single-instance lock. The lock request
 * above only probes availability; the long-lived ownership lock must wrap
 * the whole db.worker lifetime.
 *
 * @param fn Callback receiving nothing; resolves while the lock is held.
 */
export async function withInstanceLock(fn: () => Promise<void>): Promise<boolean> {
  try {
    return await navigator.locks.request(INSTANCE_LOCK_NAME, async () => {
      await fn();
      return true;
    });
  } catch {
    return false;
  }
}
