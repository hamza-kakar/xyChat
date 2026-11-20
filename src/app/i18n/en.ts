/**
 * All user-facing UI strings. English is the v1 language; the object is
 * `as const` so keys are a literal union, ready for future translations
 * (`Record<StringKey, string>` shape). The app name is interpolated from
 * APP_NAME via `{appName}` — it is never hard-coded here.
 */
export const en = {
  tagline: 'Your chats, kept private on this device.',
  boot: {
    checkingCapabilities: 'Checking browser support…',
    unsupportedTitle: 'This browser isn\u2019t supported',
    unsupportedIntro: '{appName} needs the following browser features, which are missing here:',
    minimumRequirements: '{appName} requires iOS 17+ or a current desktop browser.',
  },
  capability: {
    moduleWorkers: 'Web Workers (module)',
    webAssembly: 'WebAssembly',
    opfs: 'Private file storage (OPFS)',
    syncAccessHandle: 'Fast file writes (OPFS sync access handles)',
    cryptoSubtle: 'Secure hashing (crypto.subtle)',
    navigatorLocks: 'Single-instance locking (navigator.locks)',
    // Reserved for the M2 FTS5 probe (ADR 0008).
    fts5: 'Full-text search engine (SQLite FTS5)',
  },
  errorBoundary: {
    title: 'Something went wrong',
    description: 'An unexpected error occurred. Your imported chats are safe.',
    reloadButton: 'Reload app',
  },
  home: {
    versionLabel: 'Version {version}',
    importButton: 'Import a chat',
  },
  install: {
    gateTitle: 'Install {appName} first',
    gateBody:
      'Imports made in a browser tab are stored separately and can be deleted by Safari. Install {appName} to your Home Screen before importing.',
    gateSteps: {
      ios: 'In Safari, tap Share, then \u201CAdd to Home Screen\u201D, then Open.',
      generic:
        'Use your browser\u2019s Install option, then reopen {appName} from the home screen.',
    },
    bypassButton: 'Continue anyway (not recommended)',
    proceedButton: 'Continue',
  },
  import: {
    pickTitle: 'Import a WhatsApp export',
    pickBody:
      'In WhatsApp, open the chat, tap the chat name, then Export Chat (with or without media), and save the file.',
    pickButton: 'Choose export file (.zip or .txt)',
    detecting: 'Reading the export\u2026',
    confirmTitle: 'Confirm import',
    confirmPlatform: 'Detected platform: {platform}',
    confirmClock: 'Clock: {clock}, seconds: {seconds}',
    confirmDateOrder: 'Date order: {order}',
    confirmDateOrderHint:
      'This export\u2019s day/month order is ambiguous \u2014 check the preview and pick the right one.',
    dateOrderDmy: 'Day / Month',
    dateOrderMdy: 'Month / Day',
    confirmPreviewHeading: 'First messages (preview)',
    confirmTitleField: 'Chat name',
    confirmSelfHeading: 'Which one is you?',
    confirmSelfSkip: 'Skip for now',
    confirmTargetHeading: 'Destination',
    confirmTargetNew: 'New chat',
    confirmTargetMerge: 'Update existing chat: {title}',
    confirmSummary:
      '{messages} messages \u00B7 {participants} participants \u00B7 {media} media files',
    confirmQuota: 'Archive {archive} \u00B7 uncompressed {uncompressed}',
    confirmFreeStorage: 'Free storage: {free}',
    confirmMissingMedia: '{missing} referenced media files are not in the archive',
    confirmStartButton: 'Start import',
    confirmBackButton: 'Back',
    progressTitle: 'Importing\u2026',
    progressKeepOpen: 'Keep this screen open until the import finishes.',
    progressCancelButton: 'Cancel import',
    phaseReadingArchive: 'Reading archive',
    phaseParsing: 'Parsing messages',
    phaseFingerprinting: 'Fingerprinting',
    phaseWritingMedia: 'Writing media',
    phaseThumbnails: 'Generating thumbnails',
    phaseDone: 'Done',
    reportTitle: 'Import complete',
    reportAdded: '{count} messages imported',
    reportDuplicates: '{count} duplicates skipped',
    reportWarningsHeading: 'Warnings',
    reportWarningsCount: '{count}× {text}',
    warnings: {
      ORPHAN_LINES_BEFORE_FIRST_MESSAGE:
        '{count} lines before the first message were skipped (app banner text).',
      INVALID_DATE: '{count} lines had an unreadable date and were kept as message text.',
      INVALID_TIME: '{count} lines had an unreadable time and were kept as message text.',
      UNRECOGNIZED_ATTACHMENT_MARKER: '{count} media references used an unknown format.',
      DECODING_REPLACEMENT_CHARS: '{count} unreadable characters were replaced.',
      OUT_OF_ORDER_TIMESTAMP: '{count} messages are out of chronological order (kept as sent).',
    },
    reportMediaStored: '{count} media files stored',
    reportMediaMissing: '{count} media files missing from the archive',
    reportMediaOmitted: '{count} media omitted by the export',
    reportUpgraded: '{count} media upgraded',
    reportWarnings: '{count} warnings (see below)',
    reportNoWarnings: 'No warnings',
    reportDuration: 'Finished in {seconds} s',
    reportDecoding: '{count} unreadable characters were replaced',
    reportOpenChat: 'Open chat',
    reportDoneButton: 'Done',
    errorTitle: 'Import failed',
    errorCancelled: 'Import cancelled. Nothing was imported.',
    errorCopyDiagnostics: 'Copy diagnostic details',
    errorCopied: 'Copied',
    errorRetryButton: 'Try another file',
    errors: {
      UNSUPPORTED_FILE_TYPE:
        'That file type isn\u2019t supported. Use a WhatsApp export (.zip or .txt).',
      FILE_TOO_LARGE: 'The export file is too large.',
      CORRUPT_ARCHIVE: 'The file could not be read as a WhatsApp export.',
      ARCHIVE_TOO_LARGE: 'The uncompressed export is too large for this device.',
      ENTRY_TOO_LARGE: 'One of the files inside the archive is too large.',
      COMPRESSION_RATIO: 'The archive looks unsafe (abnormal compression) and was rejected.',
      QUOTA_EXCEEDED: 'Not enough free storage on this device for this export.',
      PATH_TRAVERSAL: 'The archive contains unsafe file paths and was rejected.',
      TOO_MANY_ENTRIES: 'The archive contains too many files.',
      ENTRY_NOT_FOUND: 'A required file is missing from the archive.',
      NO_CHAT_TEXT_FOUND: 'No chat text was found in this file.',
      UNRECOGNIZED_FORMAT: 'This doesn\u2019t look like a WhatsApp export.',
      CANCELLED: 'Import cancelled.',
      COMMIT_FAILED: 'Saving the import failed.',
      INTERNAL: 'An unexpected error occurred. Try again.',
    },
  },
  byteUnits: {
    b: '{count} B',
    kb: '{count} KB',
    mb: '{count} MB',
    gb: '{count} GB',
  },
} as const;

export type Strings = typeof en;
export type StringKey = keyof Strings;
