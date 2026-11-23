/**
 * In-memory scratch databases for backup and restore (AGENTS.md §10.6).
 * A backup snapshot is built in a fresh in-memory database and serialized
 * to bytes; a restore deserializes the backup's bytes into another one.
 * Neither touches the opfs-sahpool VFS, so the app database keeps its
 * single connection (§10.1) and the same code runs in page-context tests.
 */
import type { Sqlite3Static } from '@sqlite.org/sqlite-wasm';
import { wrapDatabase, type SqliteDatabase } from './db-wrapper';

/** A scratch database that can serialize itself. */
export interface ScratchDatabase extends SqliteDatabase {
  /** The whole database file as bytes (sqlite3_serialize). */
  exportBytes(): Uint8Array;
}

/** Factory for scratch databases. */
export interface ScratchDatabases {
  /** Opens an empty in-memory database. */
  create(): ScratchDatabase;
  /**
   * Opens an in-memory database over a copy of `bytes`.
   *
   * @throws When SQLite rejects the image (the caller maps this to a
   *   corrupt-backup error).
   */
  fromBytes(bytes: Uint8Array): ScratchDatabase;
}

/** Pragmas for scratch connections: an untrusted schema may not run
 * functions with side effects from views or triggers. */
const SCRATCH_PRAGMAS = 'PRAGMA trusted_schema=OFF; PRAGMA temp_store=MEMORY;';

/**
 * Builds the scratch-database factory over an initialized sqlite3 module.
 *
 * @param sqlite3 The module returned by `initSqlite3()`.
 * @returns The factory.
 * @example
 * const scratch = createScratchDatabases(sqlite3);
 * const db = scratch.create();
 * const bytes = db.exportBytes();
 */
export function createScratchDatabases(sqlite3: Sqlite3Static): ScratchDatabases {
  const wrap = (raw: InstanceType<Sqlite3Static['oo1']['DB']>): ScratchDatabase => {
    const wrapped = wrapDatabase(raw);
    wrapped.exec(SCRATCH_PRAGMAS);
    return { ...wrapped, exportBytes: () => sqlite3.capi.sqlite3_js_db_export(raw) };
  };
  return {
    create: () => wrap(new sqlite3.oo1.DB({ filename: ':memory:', flags: 'c' })),
    fromBytes: (bytes) => {
      const raw = new sqlite3.oo1.DB({ filename: ':memory:', flags: 'c' });
      try {
        // SQLite owns (and frees) the copy; RESIZEABLE lets migrations grow it.
        const pointer = sqlite3.wasm.allocFromTypedArray(bytes);
        const flags =
          sqlite3.capi.SQLITE_DESERIALIZE_FREEONCLOSE | sqlite3.capi.SQLITE_DESERIALIZE_RESIZEABLE;
        raw.checkRc(
          sqlite3.capi.sqlite3_deserialize(raw, 'main', pointer, bytes.length, bytes.length, flags),
        );
        return wrap(raw);
      } catch (error) {
        raw.close();
        throw error;
      }
    },
  };
}
