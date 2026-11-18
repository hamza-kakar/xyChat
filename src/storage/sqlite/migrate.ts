/**
 * Migration runner (AGENTS.md §10.3): applies `MIGRATIONS` in order inside
 * transactions, tracking `meta.schema_version`. Refuses to open a database
 * newer than the app (never corrupt data).
 */
import { MIGRATIONS, SCHEMA_VERSION } from './migrations';
import type { SqliteDatabase } from './open';

/** Reads a `meta` value, or null when absent. */
function getMeta(db: SqliteDatabase, key: string): string | null {
  const rows = db.selectObjects('SELECT value FROM meta WHERE key = ?', [key]);
  const first = rows[0];
  return typeof first?.['value'] === 'string' ? first['value'] : null;
}

/** Ensures the meta table exists before any migration reads it. */
function ensureMetaTable(db: SqliteDatabase): void {
  db.exec(
    'CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;',
  );
}

/** Reads the current schema version (0 for a fresh database). */
function readSchemaVersion(db: SqliteDatabase): number {
  const raw = getMeta(db, 'schema_version');
  if (raw === null) {
    return 0;
  }
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
}

/**
 * Applies pending migrations.
 *
 * @throws When the database was written by a NEWER app version, or when a
 *   migration fails (the caller maps this to the boot failure screen).
 */
export function migrate(db: SqliteDatabase): void {
  ensureMetaTable(db);
  const current = readSchemaVersion(db);
  if (current > SCHEMA_VERSION) {
    throw new Error(
      `database schema version ${current} is newer than the app's ${SCHEMA_VERSION}; please update the app`,
    );
  }
  for (const migration of MIGRATIONS) {
    if (migration.version <= current) {
      continue;
    }
    db.transaction(() => {
      migration.up(db);
      db.run(
        'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
        ['schema_version', String(migration.version)],
      );
    });
  }
}
