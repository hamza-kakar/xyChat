/**
 * Migration registry: an ordered list of `{ version, up }`
 * steps. Each runs inside one transaction; there are no down-migrations —
 * backup before migrating.
 */
import type { SqliteDatabase } from './open';
import { SQL_0001_INIT } from './migrations/0001-init';
import { SQL_0002_ATTACHMENTS_MESSAGE_INDEX } from './migrations/0002-attachments-message-index';

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
    up: (db: SqliteDatabase): void => {
      db.exec(SQL_0001_INIT);
    },
  },
  {
    version: 2,
    up: (db: SqliteDatabase): void => {
      db.exec(SQL_0002_ATTACHMENTS_MESSAGE_INDEX);
    },
  },
];

/** The newest schema version this app understands. */
export const SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1]?.version ?? 0;
