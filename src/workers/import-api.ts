/**
 * import.worker's Comlink API surface (AGENTS.md §3.2, §9.1): the main
 * thread's ONLY channel into the import pipeline. Imported TYPE-ONLY by the
 * client (§3.1). The pipeline grows milestone-by-milestone; every method
 * answers a discriminated Result shape, never raw exceptions (§18.7).
 */
import type { DetectReport, ImportError } from './import-detect';

/** Detection outcome over the wire (§9.2 step 4). */
export type DetectAnswer =
  | { readonly ok: true; readonly report: DetectReport }
  | {
      readonly ok: false;
      readonly error: ImportError;
    };

/** The import.worker API exposed over Comlink. */
export interface ImportWorkerApi {
  /**
   * Detection phase (§9.2 step 4): reads the archive, detects the format,
   * derives the confirmation-screen metadata. The worker stays stateless —
   * the caller keeps the file and re-sends it to start the pipeline.
   */
  detect(file: Blob, fileName: string, localeHint?: string): Promise<DetectAnswer>;
}
