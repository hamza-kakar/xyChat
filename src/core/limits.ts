/**
 * Core safety limits for untrusted import input (AGENTS.md §15.2). Constants
 * live in core so workers and the UI share them without layer violations
 * (§3.1). Exceeding any limit produces a typed error, never a crash.
 */
/** Bytes per MiB. */
const MIB = 1024 * 1024;
/** Bytes per GiB. */
const GIB = 1024 * MIB;

export const IMPORT_LIMITS = {
  /** Maximum accepted size of the exported chat text file. */
  maxTextFileBytes: 200 * MIB,
  /** Maximum accepted size of a single media entry inside an archive. */
  maxMediaEntryBytes: 2 * GIB,
  /** Maximum number of entries accepted inside one archive. */
  maxZipEntries: 100_000,
  /** Maximum size of a `.vcf` contact card we are willing to parse. */
  maxVcfBytes: 1 * MIB,
  /** Abort an archive whose uncompressed total exceeds this. */
  maxUncompressedTotalBytes: 20 * GIB,
  /** Abort an entry whose compression ratio exceeds this value. */
  maxCompressionRatio: 1000,
  /** Larger image entries get no thumbnail: decoding needs the whole entry
   * in memory, which iOS can't afford for huge files (§9.4, §9.2 step 9). */
  maxThumbnailSourceBytes: 50 * MIB,
  /** Thumbnail long edge in pixels (§9.2 step 9). */
  thumbnailLongEdge: 320,
  /** Thumbnail JPEG quality (§9.2 step 9). */
  thumbnailQuality: 0.8,
} as const;

/** App-lock parameters (AGENTS.md §15.3). */
export const APP_LOCK = {
  /** PBKDF2-SHA-256 iterations for the PIN hash. */
  pinHashIterations: 600_000,
  /** Salt length in bytes. */
  pinSaltBytes: 16,
  /** Derived key length in bytes (SHA-256 output size). */
  pinHashBytes: 32,
  /** Failed attempts allowed before the backoff starts. */
  freeAttempts: 5,
  /** The first backoff after the free attempts are used up. */
  firstLockoutMs: 30_000,
  /** The backoff stops doubling at one day, so it never overflows. */
  maxLockoutMs: 24 * 60 * 60 * 1000,
  /** Doublings beyond this already exceed the one-day cap. */
  maxDoublings: 32,
  /** The auto-lock choices offered in Settings, in minutes (0 = immediately). */
  autoLockMinutes: [0, 1, 5, 15],
} as const;

/** Backup and restore limits (AGENTS.md §10.6, §15.2). */
export const BACKUP_LIMITS = {
  /** Largest `manifest.json` a restore reads. */
  maxManifestBytes: 1 * MIB,
  /** Largest `db.sqlite3` a restore loads; it is held in memory whole. */
  maxDatabaseBytes: 512 * MIB,
  /** Backups above this get the iPhone memory warning (§10.6). */
  largeBackupBytes: 1 * GIB,
  /** Written paths are flushed to the import row this often (§9.2 step 8). */
  writtenPathsFlushEvery: 100,
} as const;
