/**
 * Migration registry (AGENTS.md §10.3): an ordered list of `{ version, up }`
 * steps. Each runs inside one transaction; there are no down-migrations —
 * backup before migrating (§10.6).
 */
import type { SqliteDatabase } from './open';
import { SQL_0001_INIT } from './migrations/0001-init';

/** One schema migration step. */
export interface Migration {
  /** Target `meta.schema_version` after this migration runs. */
  readonly version: number;
  /** Applies the migration; the caller wraps it in a transaction. */
  readonly up: (db: SqliteDatabase) => void;
}

/** All migrations, ordered by version. */
export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    up: (db) => {
      db.exec(SQL_0001_INIT);
    },
  },
];

/** The newest schema version this app understands. */
export const SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1]?.version ?? 0;
