/**
 * Tracks whether an import, backup or restore is running anywhere in the
 * app, so the update prompt can wait until it ends (AGENTS.md §12.12).
 * Screens hold a task while their job runs; the count survives screens
 * mounting and unmounting in any order.
 */
import { useEffect, useSyncExternalStore } from 'react';

let runningTasks = 0;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function isAnyTaskRunning(): boolean {
  return runningTasks > 0;
}

/** Marks a long task as running while `active` is true. */
export function useHoldLongTask(active: boolean): void {
  useEffect(() => {
    if (!active) {
      return undefined;
    }
    runningTasks += 1;
    notify();
    return () => {
      runningTasks -= 1;
      notify();
    };
  }, [active]);
}

/** True while any screen holds a long task. */
export function useIsLongTaskRunning(): boolean {
  return useSyncExternalStore(subscribe, isAnyTaskRunning, isAnyTaskRunning);
}
