import { describe, expect, it } from 'vitest';
import { createSerialQueue } from './serial-queue';

describe('createSerialQueue', () => {
  it('runs tasks one at a time in call order', async () => {
    const queue = createSerialQueue();
    const events: string[] = [];
    const task = (name: string, ms: number) => () =>
      new Promise<string>((resolve) => {
        events.push(`start ${name}`);
        setTimeout(() => {
          events.push(`end ${name}`);
          resolve(name);
        }, ms);
      });
    const results = await Promise.all([queue(task('a', 20)), queue(task('b', 1))]);
    expect(results).toEqual(['a', 'b']);
    expect(events).toEqual(['start a', 'end a', 'start b', 'end b']);
  });

  it('keeps going after a task fails', async () => {
    const queue = createSerialQueue();
    const failed = queue(() => Promise.reject(new Error('boom')));
    const next = queue(() => Promise.resolve(7));
    await expect(failed).rejects.toThrow('boom');
    await expect(next).resolves.toBe(7);
  });
});
