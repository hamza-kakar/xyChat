import { useEffect, useState } from 'react';
import { en } from '../../i18n/en';
import { acquireScreenWakeLock, type WakeLockHandle } from '../../../platform/wake-lock';
import { onImportProgress } from '../../../client/import-client';

/** Props for {@link ImportProgressStep}. */
export interface ImportProgressStepProps {
  readonly onCancel: () => void;
}

/** Progress phases in §9.1 order with their i18n labels. */
const PHASES: readonly { readonly id: string; readonly label: string }[] = [
  { id: 'reading-archive', label: en.import.phaseReadingArchive },
  { id: 'parsing', label: en.import.phaseParsing },
  { id: 'fingerprinting', label: en.import.phaseFingerprinting },
  { id: 'writing-media', label: en.import.phaseWritingMedia },
  { id: 'thumbnails', label: en.import.phaseThumbnails },
  { id: 'done', label: en.import.phaseDone },
];

/** Progress step (§12.8.5): per-phase step indicator plus a determinate
 * bar for the active phase, and the Cancel button (§9.3). */
export function ImportProgressStep({ onCancel }: ImportProgressStepProps) {
  const [current, setCurrent] = useState<{ phase: string; current: number; total: number }>({
    phase: 'reading-archive',
    current: 0,
    total: 1,
  });

  useEffect(() => {
    const unsubscribe = onImportProgress((event) => {
      setCurrent(event);
    });
    return unsubscribe;
  }, []);

  // §12.8.5 (review Blocker 4): keep the screen awake while the import
  // runs; released on unmount (done/cancel/fail) and re-acquired when the
  // tab becomes visible again.
  const [, setWakeLock] = useState<WakeLockHandle | null>(null);
  useEffect(() => {
    let active = true;
    let handle: WakeLockHandle | null = null;
    const acquire = (): void => {
      void acquireScreenWakeLock().then((result) => {
        if (active && result.ok && result.value !== null) {
          handle = result.value;
          setWakeLock(result.value);
        }
      });
    };
    acquire();
    const onVisible = (): void => {
      if (document.visibilityState === 'visible') {
        acquire();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      active = false;
      document.removeEventListener('visibilitychange', onVisible);
      void handle?.release();
    };
  }, []);

  const phaseIndex = PHASES.findIndex((phase) => phase.id === current.phase);
  const activeIndex = phaseIndex === -1 ? 0 : phaseIndex;
  const fraction = current.total > 0 ? Math.min(1, current.current / current.total) : 0;

  return (
    <main className="safe-area bg-surface mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-6">
      <h1 className="text-text text-2xl font-bold">{en.import.progressTitle}</h1>
      <ol className="flex flex-col gap-1 text-sm">
        {PHASES.map((phase, index) => (
          <li
            key={phase.id}
            className={
              index < activeIndex
                ? 'text-text-muted'
                : index === activeIndex
                  ? 'text-text font-semibold'
                  : 'text-text-muted opacity-50'
            }
          >
            {index < activeIndex ? '✓ ' : ''}
            {phase.label}
          </li>
        ))}
      </ol>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(fraction * 100)}
        className="bg-surface-raised h-2 w-full overflow-hidden rounded-full"
      >
        <div className="bg-accent h-full transition-all" style={{ width: `${fraction * 100}%` }} />
      </div>
      <p className="text-text-muted text-sm">{en.import.progressKeepOpen}</p>
      <button
        type="button"
        className="text-text border-border min-h-11 rounded-lg border px-4 py-2"
        onClick={onCancel}
      >
        {en.import.progressCancelButton}
      </button>
    </main>
  );
}
