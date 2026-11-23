/**
 * Tracks whether an import, backup or restore is running anywhere in the
 * app, so the update prompt can wait until it ends.
 * Worker jobs are tracked until their promise settles, even when the
 * screen that started them closes; screens can also hold a task for steps
 * that belong to a job but run no worker call (the import's confirm step).
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

function holdTask(): () => void {
  runningTasks += 1;
  notify();
  let released = false;
  return () => {
    if (!released) {
      released = true;
      runningTasks -= 1;
      notify();
    }
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
    return holdTask();
  }, [active]);
}

/** Counts `job` as a running long task until it settles; returns it. */
export function trackLongTask<T>(job: Promise<T>): Promise<T> {
  const release = holdTask();
  return job.finally(release);
}

/** True while any screen holds a long task. */
export function useIsLongTaskRunning(): boolean {
  return useSyncExternalStore(subscribe, isAnyTaskRunning, isAnyTaskRunning);
}
