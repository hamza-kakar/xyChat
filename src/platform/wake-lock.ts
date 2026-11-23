/**
 * Screen wake lock: keeps the
 * screen awake during long imports when `navigator.wakeLock` is available.
 * Pure platform wrapper (platform → core only); the UI acquires on
 * start and releases on done/cancel/fail/unmount, re-acquiring on
 * `visibilitychange` (hooks live with the feature flow).
 */
import { err, ok, type Result } from '../core/result';

/** A held wake-lock handle (releases on `release()`). */
export interface WakeLockHandle {
  readonly release: () => Promise<void>;
}

/** Acquires the screen wake lock; ok(null) when unsupported (the
 * import proceeds; the text warning covers the battery cost). */
export async function acquireScreenWakeLock(): Promise<Result<WakeLockHandle | null, string>> {
  const wakeLock = (
    navigator as {
      readonly wakeLock?: {
        request: (type: 'screen') => Promise<{ release: () => Promise<void> }>;
      };
    }
  ).wakeLock;
  if (wakeLock === undefined) {
    return ok(null);
  }
  try {
    const sentinel = await wakeLock.request('screen');
    return ok({ release: () => sentinel.release() });
  } catch (error) {
    return err(error instanceof Error ? error.name : 'wake lock failed');
  }
}
