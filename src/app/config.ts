/**
 * App-wide constants. The app's display name lives in `app-name.ts` (shared
 * with the Vite config so the manifest never drifts from the UI).
 */
export { APP_NAME } from './app-name';

export { BACKUP_LIMITS, IMPORT_LIMITS } from '../core/limits';

/** Version injected at build time from package.json (see vite.config.ts). */
declare const __APP_VERSION__: string;
export const APP_VERSION: string = __APP_VERSION__;

/** Search tuning. */
export const SEARCH = {
  /** Keyset page size for search results. */
  PAGE_SIZE: 50,
  /** Queries shorter than this use the in-chat LIKE fallback. */
  MIN_FULL_TEXT_LENGTH: 3,
  /** Result cap of the 1–2 character fallback. */
  SHORT_QUERY_RESULT_CAP: 500,
  /** Typing pause before a search runs. */
  DEBOUNCE_MS: 250,
} as const;

/** How long a jumped-to message stays highlighted. */
export const JUMP_HIGHLIGHT_MS = 2500;

/** Media gallery and playback tuning. */
export const MEDIA = {
  /** Gallery and links page size. */
  PAGE_SIZE: 120,
  /** Lazy video thumbnails made at once. */
  VIDEO_THUMB_CONCURRENCY: 2,
  /** Longest thumbnail edge. */
  THUMB_MAX_EDGE: 320,
  /** JPEG quality of lazy video thumbnails. */
  THUMB_QUALITY: 0.8,
  /** Seek target for a video thumbnail, capped at half the duration (s). */
  VIDEO_THUMB_SEEK_S: 1,
  /** Playback speeds the audio player cycles through. */
  PLAYBACK_RATES: [1, 1.5, 2],
} as const;

/** The public source repository (Settings → About). */
export const SOURCE_URL = 'https://github.com/hamza-kakar/xyChat';
