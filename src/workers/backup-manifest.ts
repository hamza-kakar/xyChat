/**
 * Backup archive layout (AGENTS.md §10.6): entry names, the manifest
 * schema (validated on restore, §18.5) and the archive's file name.
 */
import * as v from 'valibot';
import type { BackupChatSummary } from '../storage/sqlite/backup-snapshot';

/** The manifest entry, written first. */
export const MANIFEST_ENTRY = 'manifest.json';
/** The database snapshot entry. */
export const DATABASE_ENTRY = 'db.sqlite3';

const Count = v.pipe(v.number(), v.integer(), v.minValue(0));

/** The manifest of a backup archive. */
export const BackupManifestSchema = v.object({
  app: v.pipe(v.string(), v.nonEmpty(), v.maxLength(64)),
  appVersion: v.pipe(v.string(), v.nonEmpty(), v.maxLength(32)),
  schemaVersion: v.pipe(Count, v.minValue(1)),
  createdAt: v.pipe(v.string(), v.isoTimestamp()),
  chats: v.pipe(
    v.array(
      v.object({
        id: v.pipe(v.string(), v.nonEmpty(), v.maxLength(64)),
        title: v.pipe(v.string(), v.maxLength(1_000)),
        messageCount: Count,
        mediaCount: Count,
        firstTsKey: v.nullable(v.number()),
        lastTsKey: v.nullable(v.number()),
      }),
    ),
    v.maxLength(10_000),
  ),
  includesMedia: v.boolean(),
});

/** A backup manifest. */
export type BackupManifest = v.InferOutput<typeof BackupManifestSchema>;

/**
 * Builds a manifest.
 *
 * @param input App identity, schema version, the chats and the media flag.
 * @returns The manifest object written as `manifest.json`.
 */
export function buildManifest(input: {
  readonly app: string;
  readonly appVersion: string;
  readonly schemaVersion: number;
  readonly createdAt: Date;
  readonly chats: readonly BackupChatSummary[];
  readonly includesMedia: boolean;
}): BackupManifest {
  return {
    app: input.app,
    appVersion: input.appVersion,
    schemaVersion: input.schemaVersion,
    createdAt: input.createdAt.toISOString(),
    chats: [...input.chats],
    includesMedia: input.includesMedia,
  };
}

/**
 * Parses `manifest.json` text.
 *
 * @param text The entry's text.
 * @returns The manifest, or null when it is not valid JSON or does not match.
 */
export function parseManifest(text: string): BackupManifest | null {
  let json: unknown;
  try {
    json = JSON.parse(text) as unknown;
  } catch {
    return null;
  }
  const result = v.safeParse(BackupManifestSchema, json);
  return result.success ? result.output : null;
}

/** Two-digit zero padding. */
function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/**
 * The archive's file name, `<app>-backup-YYYYMMDD-HHMM.zip` in device time.
 *
 * @param appName The app's display name (lower-cased, letters and digits kept).
 * @param date When the backup was made.
 * @example
 * backupFileName('ChatKeep', new Date(2026, 10, 23, 9, 5)); // 'chatkeep-backup-20261123-0905.zip'
 */
export function backupFileName(appName: string, date: Date): string {
  const slug = appName.toLowerCase().replace(/[^a-z0-9]/gu, '') || 'chats';
  const day = `${String(date.getFullYear())}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
  return `${slug}-backup-${day}-${pad(date.getHours())}${pad(date.getMinutes())}.zip`;
}
