/**
 * Runs async tasks one at a time, in call order. A task's failure doesn't
 * stop the ones queued after it.
 */

/** Queues a task behind every task queued before it. */
export type SerialQueue = <T>(task: () => Promise<T>) => Promise<T>;

/**
 * Creates an empty queue.
 *
 * @returns A function that runs each given task after the previous ones
 *   have settled.
 */
export function createSerialQueue(): SerialQueue {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(task: () => Promise<T>): Promise<T> => {
    const run = tail.then(task, task);
    tail = run.catch(() => undefined);
    return run;
  };
}
