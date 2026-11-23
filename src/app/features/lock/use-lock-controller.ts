/**
 * Lock state machine: locked at launch when a PIN is set;
 * a privacy cover the moment the app is hidden (so the app-switcher
 * snapshot shows no chats); then locking per the auto-lock setting, on
 * hide or after inactivity.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { isInactiveTooLong, locksOnHide } from './auto-lock';

/** How often the inactivity deadline is checked while visible. */
const INACTIVITY_CHECK_MS = 5000;
const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;

/** The lock settings the controller follows (undefined while loading). */
export interface LockSettings {
  readonly hasPin: boolean;
  readonly autoLockMinutes: number;
}

/** The controller's output. */
export interface LockController {
  /** null until the settings are known. */
  readonly locked: boolean | null;
  /** True while the app is hidden. */
  readonly covered: boolean;
  readonly lockNow: () => void;
  readonly unlock: () => void;
}

export function useLockController(settings: LockSettings | undefined): LockController {
  const hasPin = settings?.hasPin ?? null;
  const autoLockMinutes = settings?.autoLockMinutes ?? 0;
  const [locked, setLocked] = useState<boolean | null>(null);
  const [covered, setCovered] = useState(false);
  const [seenHasPin, setSeenHasPin] = useState<boolean | null>(null);
  const lastActivity = useRef(0);

  // Follow the settings as they load or change: lock at launch with a PIN;
  // removing the PIN unlocks; setting one doesn't lock the open session.
  if (hasPin !== seenHasPin) {
    setSeenHasPin(hasPin);
    if (seenHasPin === null && hasPin !== null) {
      setLocked(hasPin);
    } else if (hasPin === false) {
      setLocked(false);
    }
  }

  useEffect(() => {
    lastActivity.current = Date.now();
    const onVisibility = (): void => {
      if (document.visibilityState === 'hidden') {
        // Commit synchronously: the snapshot is taken right after hiding.
        flushSync(() => {
          setCovered(true);
          if (locksOnHide(hasPin === true, autoLockMinutes)) {
            setLocked(true);
          }
        });
        return;
      }
      const now = Date.now();
      if (
        isInactiveTooLong({
          hasPin: hasPin === true,
          autoLockMinutes,
          lastActivity: lastActivity.current,
          now,
        })
      ) {
        setLocked(true);
      }
      lastActivity.current = now;
      setCovered(false);
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [hasPin, autoLockMinutes]);

  useEffect(() => {
    if (hasPin !== true || autoLockMinutes === 0 || locked !== false) {
      return undefined;
    }
    const onActivity = (): void => {
      lastActivity.current = Date.now();
    };
    for (const type of ACTIVITY_EVENTS) {
      window.addEventListener(type, onActivity, { capture: true, passive: true });
    }
    const timer = setInterval(() => {
      const now = Date.now();
      if (isInactiveTooLong({ hasPin, autoLockMinutes, lastActivity: lastActivity.current, now })) {
        setLocked(true);
      }
    }, INACTIVITY_CHECK_MS);
    return () => {
      clearInterval(timer);
      for (const type of ACTIVITY_EVENTS) {
        window.removeEventListener(type, onActivity, { capture: true });
      }
    };
  }, [hasPin, autoLockMinutes, locked]);

  const lockNow = useCallback(() => {
    setLocked(true);
  }, []);
  const unlock = useCallback(() => {
    lastActivity.current = Date.now();
    setLocked(false);
  }, []);
  return { locked, covered, lockNow, unlock };
}
