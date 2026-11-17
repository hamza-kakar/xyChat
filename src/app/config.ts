/**
 * App-wide constants. The app's display name lives in `app-name.ts` (shared
 * with the Vite config so the manifest never drifts from the UI).
 */
export { APP_NAME } from './app-name';

/** Version injected at build time from package.json (see vite.config.ts). */
declare const __APP_VERSION__: string;
export const APP_VERSION: string = __APP_VERSION__;

/**
 * Hard safety limits for untrusted import input (AGENTS.md §15.2). Exceeding
 * any of these produces a typed error, never a crash.
 */
export const IMPORT_LIMITS = {
  /** Maximum accepted size of the exported chat text file. */
  maxTextFileBytes: 200 * 1024 * 1024,
  /** Maximum accepted size of a single media entry inside an archive. */
  maxMediaEntryBytes: 2 * 1024 * 1024 * 1024,
  /** Maximum number of entries accepted inside one archive. */
  maxZipEntries: 100_000,
  /** Maximum size of a `.vcf` contact card we are willing to parse. */
  maxVcfBytes: 1024 * 1024,
  /** Abort an archive whose uncompressed total exceeds this. */
  maxUncompressedTotalBytes: 20 * 1024 * 1024 * 1024,
  /** Abort an entry whose compression ratio exceeds this value. */
  maxCompressionRatio: 1000,
} as const;

/** Object URL cache size for media display (AGENTS.md §10.4). */
export const OBJECT_URL_CACHE_LIMIT = 200;

/** Longest edge of generated image thumbnails (AGENTS.md §9.2). */
export const THUMBNAIL_LONG_EDGE = 320;

/** JPEG quality of generated thumbnails. */
export const THUMBNAIL_JPEG_QUALITY = 0.8;
