/**
 * Persisted log entries (AGENTS.md §18.7): the last 200 warn/error entries
 * survive a reload in `meta`, for the Diagnostics log viewer. Entries are
 * codes plus small structured payloads (never content, §15.4); they are
 * validated on the way in and on the way out (§18.5).
 */
import * as v from 'valibot';
import { deleteMeta, readMetaJson, writeMetaJson } from './meta';
import type { SqliteDatabase } from './open';

const LOGS_KEY = 'log_entries';
/** How many warn/error entries are kept (§18.7). */
export const PERSISTED_LOG_LIMIT = 200;
const MAX_DATA_KEYS = 16;

export const PersistedLogEntrySchema = v.object({
  timestamp: v.pipe(v.number(), v.integer(), v.minValue(0)),
  level: v.picklist(['warn', 'error']),
  code: v.pipe(v.string(), v.minLength(1), v.maxLength(64)),
  data: v.pipe(
    v.record(
      v.pipe(v.string(), v.maxLength(32)),
      v.union([v.number(), v.pipe(v.string(), v.maxLength(400)), v.boolean(), v.null()]),
    ),
    v.check((value) => Object.keys(value).length <= MAX_DATA_KEYS, 'too many fields'),
  ),
});

export const PersistedLogsSchema = v.pipe(
  v.array(PersistedLogEntrySchema),
  v.maxLength(PERSISTED_LOG_LIMIT),
);

/** One persisted log entry. */
export type PersistedLogEntry = v.InferOutput<typeof PersistedLogEntrySchema>;

/**
 * Reads the persisted entries, oldest first.
 *
 * @param db The open database.
 * @returns The entries; an invalid stored list reads as empty.
 */
export function readPersistedLogs(db: SqliteDatabase): readonly PersistedLogEntry[] {
  return readMetaJson(db, LOGS_KEY, PersistedLogsSchema) ?? [];
}

/**
 * Replaces the persisted entries (the newest {@link PERSISTED_LOG_LIMIT}
 * are kept); an empty list clears them.
 *
 * @param db The open database.
 * @param entries Validated entries, oldest first.
 */
export function writePersistedLogs(
  db: SqliteDatabase,
  entries: readonly PersistedLogEntry[],
): void {
  if (entries.length === 0) {
    deleteMeta(db, LOGS_KEY);
    return;
  }
  writeMetaJson(db, LOGS_KEY, entries.slice(-PERSISTED_LOG_LIMIT));
}
