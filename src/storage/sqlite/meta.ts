/**
 * Typed access to the `meta` key/value table (AGENTS.md §10.2, §15.4):
 * app settings live here, not in localStorage. Every read is validated
 * (§18.5); a missing, malformed or invalid value reads as null.
 */
import * as v from 'valibot';
import type { SqliteDatabase } from './open';

/**
 * Reads a JSON value from `meta`.
 *
 * @param db The open database.
 * @param key The meta key.
 * @param schema The Valibot schema the stored JSON must match.
 * @returns The validated value, or null.
 */
export function readMetaJson<TSchema extends v.GenericSchema>(
  db: SqliteDatabase,
  key: string,
  schema: TSchema,
): v.InferOutput<TSchema> | null {
  const value = db.selectObjects('SELECT value FROM meta WHERE key = ?', [key])[0]?.['value'];
  if (typeof value !== 'string') {
    return null;
  }
  let json: unknown;
  try {
    json = JSON.parse(value) as unknown;
  } catch {
    return null;
  }
  const result = v.safeParse(schema, json);
  return result.success ? result.output : null;
}

/**
 * Stores a JSON value in `meta` (insert or replace).
 *
 * @param db The open database.
 * @param key The meta key.
 * @param value Any JSON-serializable value.
 */
export function writeMetaJson(db: SqliteDatabase, key: string, value: unknown): void {
  db.run(
    'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
    [key, JSON.stringify(value)],
  );
}

/**
 * Removes a `meta` key.
 *
 * @param db The open database.
 * @param key The meta key.
 */
export function deleteMeta(db: SqliteDatabase, key: string): void {
  db.run('DELETE FROM meta WHERE key = ?', [key]);
}

/**
 * Reads the schema version written by the migration runner (§10.3).
 *
 * @param db The open database.
 * @returns The version, or 0 when unset.
 */
export function readSchemaVersion(db: SqliteDatabase): number {
  const value = db.selectObjects('SELECT value FROM meta WHERE key = ?', ['schema_version'])[0]?.[
    'value'
  ];
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
}
