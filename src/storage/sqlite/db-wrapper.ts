/**
 * Typed wrapper over the sqlite3 OO API (AGENTS.md §10.1): the only surface
 * the repository is allowed to use. All statement binding is parameterized —
 * string-concatenated SQL is forbidden (§10.5).
 */
import type { Database } from '@sqlite.org/sqlite-wasm';

export interface SqliteDatabase {
  /** Executes raw SQL (DDL / pragmas / migrations — never user input). */
  exec(sql: string): void;
  /** Runs a parameterized statement returning rows as objects. */
  selectObjects(
    sql: string,
    params?: readonly (string | number | null)[],
  ): Record<string, unknown>[];
  /**
   * Runs a parameterized statement returning rows as positional arrays —
   * the cheap row shape for large scans (§17: object rows cost a key
   * mapping per cell on the wasm bridge).
   */
  selectArrays(sql: string, params?: readonly (string | number | null)[]): unknown[][];
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
    selectArrays(sql: string, params?: readonly (string | number | null)[]): unknown[][] {
      if (params === undefined) {
        return db.exec({ sql, rowMode: 'array', returnValue: 'resultRows' });
      }
      return db.exec({
        sql,
        bind: [...params],
        rowMode: 'array',
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
