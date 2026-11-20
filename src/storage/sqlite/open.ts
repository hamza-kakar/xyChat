/**
 * SQLite opening (AGENTS.md §10.1): sqlite-wasm with the opfs-sahpool VFS
 * inside db.worker, behind a small typed wrapper so the repository code
 * never touches the raw C-style API. Only db.worker may call this (layer
 * rules §3.1). The lifetime single-instance lock lives in opener.ts; this
 * module is the production wiring plus the façade re-exports.
 */
import initSqlite3 from '@sqlite.org/sqlite-wasm';
import type { Sqlite3Static } from '@sqlite.org/sqlite-wasm';
import type { Result } from '../../core/result';
import { createDatabaseOpener, type OpenError } from './opener';
import { wrapDatabase, type SqliteDatabase } from './db-wrapper';

/** Database file name inside the sahpool VFS. */
const DB_FILENAME = '/chatkeep.sqlite3';
/** sahpool metadata directory (fixed; changing it orphans databases). */
const SAHPOOL_DIRECTORY = 'chatkeep-db';
/** VFS name registered by installOpfsSAHPoolVfs (§10.1). */
export const SAHPOOL_VFS_NAME = 'opfs-sahpool';

export { wrapDatabase, verifyFts5Trigram } from './db-wrapper';
export type { SqliteDatabase } from './db-wrapper';
export { createDatabaseOpener, INSTANCE_LOCK_NAME } from './opener';
export type { OpenError, OpenErrorCode, DatabaseOpenerDeps, InstanceLockManager } from './opener';

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
 * Opens the database: single-instance lock first (§10.1), then the sahpool
 * VFS, pragmas, migrations, and the FTS5 probe.
 *
 * @returns The opened, migrated database, or a structured failure.
 */
/* v8 ignore next 4 -- same worker-only constraint as openSahpool; the
 * lifetime-lock semantics are unit-tested in opener.test.ts. */
export function openDatabase(): Promise<Result<SqliteDatabase, OpenError>> {
  // Built per call so importing this module never touches `navigator`
  // (unit tests import the factory with injected fakes).
  return createDatabaseOpener({ locks: navigator.locks, openSqlite: openSahpool })();
}
