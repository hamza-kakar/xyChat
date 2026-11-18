/**
 * App-wide constants. The app's display name lives in `app-name.ts` (shared
 * with the Vite config so the manifest never drifts from the UI).
 */
export { APP_NAME } from './app-name';

export { IMPORT_LIMITS } from '../core/limits';

/** Version injected at build time from package.json (see vite.config.ts). */
declare const __APP_VERSION__: string;
export const APP_VERSION: string = __APP_VERSION__;
