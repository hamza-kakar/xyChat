/**
 * Import progress contract: the phases reported to the UI
 * and the event shape. Shared by import-run, import-media and the worker
 * API so every phase reports identically.
 */

/**  pipeline phases reported from the worker. */
export type ImportPhase =
  'reading-archive' | 'parsing' | 'fingerprinting' | 'writing-media' | 'thumbnails' | 'done';

/** One progress event (`{ phase, current, total }`). */
export interface ImportProgressEvent {
  readonly phase: ImportPhase;
  readonly current: number;
  readonly total: number;
}

/** Progress + cancellation hooks shared by the pipeline phases.
 * onWrittenPaths flushes OPFS rollback bookkeeping every 100 files — the main thread persists them against the import row. */
export interface ImportHooks {
  readonly onProgress: (event: ImportProgressEvent) => void;
  readonly isCancelled: () => boolean | Promise<boolean>;
  readonly onWrittenPaths?: (paths: readonly string[]) => void | Promise<void>;
}
