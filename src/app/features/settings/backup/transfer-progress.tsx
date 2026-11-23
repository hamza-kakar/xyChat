/**
 * Progress of a running backup or restore: the phase in
 * words, a progress bar and Cancel. The screen stays awake meanwhile.
 */
import { APP_NAME } from '../../../config';
import { en } from '../../../i18n/en';
import { formatString } from '../../../i18n/format-string';
import { useScreenWakeLock } from '../../../hooks/use-screen-wake-lock';
import type { TransferState } from './use-transfer';
import type { TransferProgress } from '../../../../client/db-client';

/** Props for {@link TransferProgressView}. */
export interface TransferProgressViewProps {
  readonly transfer: TransferState;
  /** The phase named before the first progress event arrives. */
  readonly firstPhase: TransferProgress['phase'];
  /** False once the work can no longer stop (the commit). */
  readonly canCancel: boolean;
}

export function TransferProgressView({
  transfer,
  firstPhase,
  canCancel,
}: TransferProgressViewProps) {
  useScreenWakeLock(true);
  const { progress } = transfer;
  const label =
    progress === null
      ? en.backup.phases[firstPhase]
      : formatString(en.backup.phases[progress.phase], {
          current: progress.current.toLocaleString(),
          total: progress.total.toLocaleString(),
        });
  const fraction =
    progress !== null && progress.total > 0 ? Math.min(1, progress.current / progress.total) : 0;
  return (
    <div className="flex flex-col gap-2">
      <p role="status" className="text-text">
        {transfer.cancelling ? en.backup.cancelling : label}
      </p>
      <progress className="accent-accent h-2 w-full" max={1} value={fraction} aria-label={label} />
      <p className="text-text-muted text-sm">
        {formatString(en.backup.keepOpen, { appName: APP_NAME })}
      </p>
      {canCancel ? (
        <button
          type="button"
          disabled={transfer.cancelling}
          className="border-border text-text min-h-11 rounded-lg border px-4 font-semibold disabled:opacity-60"
          onClick={transfer.cancel}
        >
          {en.backup.cancel}
        </button>
      ) : null}
    </div>
  );
}
