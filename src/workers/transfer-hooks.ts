/**
 * Backup and restore progress contract: phases,
 * the event shape, and the proxied hooks the main thread passes in for
 * progress and cancellation (same pattern as the import hooks).
 */

/** Phases of making a backup. */
export type BackupPhase = 'snapshot' | 'media' | 'finishing';

/** Phases of a restore. */
export type RestorePhase = 'reading' | 'media' | 'committing';

/** One progress event. */
export interface TransferProgressEvent {
  readonly phase: BackupPhase | RestorePhase;
  readonly current: number;
  readonly total: number;
}

/** Progress and cancellation hooks (a Comlink proxy in production). */
export interface TransferHooks {
  readonly onProgress: (event: TransferProgressEvent) => void;
  readonly isCancelled: () => boolean | Promise<boolean>;
}
