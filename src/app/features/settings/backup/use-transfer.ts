/**
 * Progress and cancellation state of a running backup or restore. The callbacks are stable, so they can travel
 * to the worker once; cancelling flips a flag the worker polls.
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import type { TransferProgress } from '../../../../client/db-client';
import type { TransferCallbacks } from '../../../queries/backup-queries';

/** The state and controls of one transfer. */
export interface TransferState {
  readonly progress: TransferProgress | null;
  readonly cancelling: boolean;
  readonly callbacks: TransferCallbacks;
  /** Clears progress and the cancel flag before a new run. */
  readonly reset: () => void;
  readonly cancel: () => void;
}

/** Tracks one transfer's progress and cancel flag. */
export function useTransfer(): TransferState {
  const [progress, setProgress] = useState<TransferProgress | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const cancelledRef = useRef(false);
  const callbacks = useMemo<TransferCallbacks>(
    () => ({
      onProgress: setProgress,
      isCancelled: () => cancelledRef.current,
    }),
    [],
  );
  const reset = useCallback(() => {
    cancelledRef.current = false;
    setCancelling(false);
    setProgress(null);
  }, []);
  const cancel = useCallback(() => {
    cancelledRef.current = true;
    setCancelling(true);
  }, []);
  return { progress, cancelling, callbacks, reset, cancel };
}
