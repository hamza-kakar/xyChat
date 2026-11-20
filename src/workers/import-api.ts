/**
 * import.worker's Comlink API surface (AGENTS.md §3.2, §9.1): the main
 * thread's ONLY channel into the import pipeline. Imported TYPE-ONLY by the
 * client (§3.1). Every method answers a discriminated Result shape, never
 * raw exceptions (§18.7).
 */
import type { DetectedFormat, ParseStats } from '../core/parser';
import type { ImportCommitResult } from '../storage/sqlite/import-commit';
import type { DetectReport, ImportError } from './import-detect';
import type { ImportHooks } from './import-progress';

/** Detection outcome over the wire (§9.2 step 4). */
export type DetectAnswer =
  | { readonly ok: true; readonly report: DetectReport }
  | {
      readonly ok: false;
      readonly error: ImportError;
    };

/** The user-confirmed choices from §12.8 (format possibly overridden). */
export interface ConfirmedImport {
  readonly format: DetectedFormat;
  /** Editable title from the confirm screen. */
  readonly title: string;
  /** Group heuristic from detection. */
  readonly isGroup: boolean;
  /** Pre-minted chat id: an existing chat (merge) or a fresh one — media
   * paths key on it BEFORE the commit creates the chats row (§9.2 step 8). */
  readonly chatId: string;
}

/** Facts for the §9.2-step-11 report beyond the commit counts. */
export interface RunReport {
  readonly warningsByCode: Readonly<Record<string, number>>;
  readonly stats: ParseStats;
  readonly replacementChars: number;
  readonly durationMs: number;
  /** Media attachment rows by status (§9.2 step 11: stored/missing/omitted). */
  readonly mediaStored: number;
  readonly mediaMissing: number;
  readonly mediaOmitted: number;
}

/** Pipeline outcome over the wire (§9.2 steps 6–11). */
export type BeginAnswer =
  | {
      readonly ok: true;
      readonly commit: ImportCommitResult;
      readonly report: RunReport;
    }
  | {
      readonly ok: false;
      readonly error: ImportError;
    };

/** Options for begin() — `hooks` is passed as a separate top-level
 * Comlink.proxy argument (transfer markers are honored at the top level
 * only). The commit port arrives via setCommitPort (§3.2). */
export interface BeginOptions {
  readonly file: Blob;
  readonly fileName: string;
  readonly confirmed: ConfirmedImport;
  readonly importId: string;
}

/** The import.worker API exposed over Comlink. */
export interface ImportWorkerApi {
  /**
   * Detection phase (§9.2 step 4): reads the archive, detects the format,
   * derives the confirmation-screen metadata. The worker stays stateless —
   * the caller keeps the file and re-sends it to start the pipeline.
   */
  detect(
    file: Blob,
    fileName: string,
    localeHint?: string,
    dateOrderOverride?: 'DMY' | 'MDY',
  ): Promise<DetectAnswer>;
  /**
   * Runs the confirmed pipeline (§9.2 steps 6–11): parse → fingerprint →
   * media writes → commit over the MessagePort. Cancellation via the
   * proxied hooks; the commit request carries the pre-assembled input.
   */
  /** Takes the import-side end of the commit MessageChannel (§3.2);
   * transferred by the caller. */
  setCommitPort(port: MessagePort): void;
  begin(options: BeginOptions, hooks: ImportHooks): Promise<BeginAnswer>;
}
