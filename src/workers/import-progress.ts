/**
 * Import progress contract (AGENTS.md §9.1): the phases reported to the UI
 * and the event shape. Shared by import-run, import-media and the worker
 * API so every phase reports identically.
 */

/** §9.1 pipeline phases reported from the worker. */
export type ImportPhase =
  'reading-archive' | 'parsing' | 'fingerprinting' | 'writing-media' | 'thumbnails' | 'done';

/** One progress event (§9.1: `{ phase, current, total }`). */
export interface ImportProgressEvent {
  readonly phase: ImportPhase;
  readonly current: number;
  readonly total: number;
}

/** Progress + cancellation hooks shared by the pipeline phases (§18.8). */
export interface ImportHooks {
  readonly onProgress: (event: ImportProgressEvent) => void;
  readonly isCancelled: () => boolean | Promise<boolean>;
}
