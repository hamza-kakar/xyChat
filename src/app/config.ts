/**
 * App-wide constants. The app's display name lives in `app-name.ts` (shared
 * with the Vite config so the manifest never drifts from the UI).
 */
export { APP_NAME } from './app-name';

export { IMPORT_LIMITS } from '../core/limits';

/** Version injected at build time from package.json (see vite.config.ts). */
declare const __APP_VERSION__: string;
export const APP_VERSION: string = __APP_VERSION__;

/** Search tuning (AGENTS.md §11). */
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

/** How long a jumped-to message stays highlighted (§11, §12.5). */
export const JUMP_HIGHLIGHT_MS = 2500;
