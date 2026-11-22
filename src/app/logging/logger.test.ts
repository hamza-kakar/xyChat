import { describe, expect, it, vi } from 'vitest';
import { logger } from './logger';

describe('logger', () => {
  it('stores entries with level, code and structured data', () => {
    logger.warn('test.code', { count: 3 });
    const last = logger.recent().at(-1);
    expect(last?.level).toBe('warn');
    expect(last?.code).toBe('test.code');
    expect(last?.data).toEqual({ count: 3 });
  });

  it('notifies subscribers on write and stops after unsubscribe', () => {
    const listener = vi.fn();
    const unsubscribe = logger.subscribe(listener);
    logger.info('test.notify');
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    logger.info('test.after-unsubscribe');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('caps the ring buffer at 1000 entries', () => {
    const before = logger.recent().length;
    for (let i = 0; i < 1005; i += 1) {
      logger.debug('test.flood', { i });
    }
    const after = logger.recent();
    expect(after.length).toBe(1000);
    expect(after.length).toBeGreaterThanOrEqual(before);
    expect(after.at(-1)?.data).toEqual({ i: 1004 });
  });
});

describe('logger snapshots and clearing', () => {
  it('keeps the snapshot stable until the next write', () => {
    logger.info('test.snapshot');
    const first = logger.recent();
    expect(logger.recent()).toBe(first);
    logger.info('test.snapshot-2');
    expect(logger.recent()).not.toBe(first);
  });

  it('clears the buffer and tells subscribers', () => {
    const listener = vi.fn();
    const unsubscribe = logger.subscribe(listener);
    logger.clear();
    expect(logger.recent()).toEqual([]);
    expect(listener).toHaveBeenCalledWith(null);
    unsubscribe();
  });
});
