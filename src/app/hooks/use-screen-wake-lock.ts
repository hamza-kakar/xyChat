/**
 * Keeps the screen awake while a long job runs (AGENTS.md §12.8 step 5,
 * §10.6) when `navigator.wakeLock` exists. Released when the job ends or
 * the component unmounts, and taken again when the page becomes visible.
 */
import { useEffect } from 'react';
import { acquireScreenWakeLock, type WakeLockHandle } from '../../platform/wake-lock';

/** Holds the screen wake lock while `active` is true. */
export function useScreenWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active) {
      return undefined;
    }
    // A wake lock resolving after cleanup must release immediately:
    // `held` guards the late resolution.
    let held = true;
    let handle: WakeLockHandle | null = null;
    const acquire = (): void => {
      void acquireScreenWakeLock().then((result) => {
        if (held && result.ok && result.value !== null) {
          handle = result.value;
        } else if (result.ok && result.value !== null) {
          void result.value.release();
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
      held = false;
      document.removeEventListener('visibilitychange', onVisible);
      void handle?.release();
    };
  }, [active]);
}
