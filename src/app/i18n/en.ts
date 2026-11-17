/**
 * All user-facing UI strings. English is the v1 language; the object is
 * `as const` so keys are a literal union, ready for future translations
 * (`Record<StringKey, string>` shape).
 */
export const en = {
  tagline: 'Your chats, kept private on this device.',
  boot: {
    checkingCapabilities: 'Checking browser support…',
    unsupportedTitle: 'This browser isn’t supported',
    unsupportedIntro: 'waChatBack needs the following browser features, which are missing here:',
    minimumRequirements: 'waChatBack requires iOS 17+ or a current desktop browser.',
  },
  capability: {
    moduleWorkers: 'Web Workers (module)',
    webAssembly: 'WebAssembly',
    opfs: 'Private file storage (OPFS)',
    syncAccessHandle: 'Fast file writes (OPFS sync access handles)',
    fts5: 'Full-text search engine (SQLite FTS5)',
    cryptoSubtle: 'Secure hashing (crypto.subtle)',
    navigatorLocks: 'Single-instance locking (navigator.locks)',
  },
  errorBoundary: {
    title: 'Something went wrong',
    description: 'An unexpected error occurred. Your imported chats are safe.',
    reloadButton: 'Reload app',
  },
  home: {
    versionLabel: 'Version {version}',
    offlineReady: 'Ready to use offline',
  },
} as const;

export type Strings = typeof en;
export type StringKey = keyof Strings;
