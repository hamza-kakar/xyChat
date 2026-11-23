import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { logger } from './logger';
import {
  clearAllLogs,
  earlierLogEntries,
  installLogPersistence,
  subscribeEarlierLogs,
  type LogStore,
} from './log-persistence';

const stored = [{ timestamp: 5, level: 'error' as const, code: 'old.failure', data: {} }];

function fakeStore(): LogStore & { readonly save: ReturnType<typeof vi.fn> } {
  return {
    load: vi.fn(() => Promise.resolve(stored)),
    save: vi.fn(() => Promise.resolve()),
  };
}

let uninstall: () => void = () => undefined;

beforeEach(() => {
  vi.useFakeTimers();
  logger.clear();
});

afterEach(() => {
  uninstall();
  vi.useRealTimers();
});

describe('log persistence', () => {
  it('loads entries from earlier sessions', async () => {
    const listener = vi.fn();
    const unsubscribe = subscribeEarlierLogs(listener);
    uninstall = installLogPersistence(fakeStore());
    await vi.waitFor(() => {
      expect(earlierLogEntries()).toEqual(stored);
    });
    expect(listener).toHaveBeenCalled();
    unsubscribe();
  });

  it('saves new warn and error entries after a quiet period, not info or debug', async () => {
    const store = fakeStore();
    uninstall = installLogPersistence(store);
    await vi.waitFor(() => {
      expect(earlierLogEntries()).toEqual(stored);
    });
    logger.info('skipped.info');
    logger.warn('kept.warn', { count: 2 });
    logger.error('kept.error', { detail: 'x'.repeat(500) });
    expect(store.save).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2000);
    expect(store.save).toHaveBeenCalledTimes(1);
    const saved = store.save.mock.calls[0]?.[0] as readonly { code: string; data: object }[];
    expect(saved.map((entry) => entry.code)).toEqual(['old.failure', 'kept.warn', 'kept.error']);
    expect(saved[2]?.data).toEqual({ detail: 'x'.repeat(400) });
  });

  it('does not save its own failed calls again', () => {
    const store = fakeStore();
    uninstall = installLogPersistence(store);
    logger.warn('rpc.failed', { method: 'savePersistedLogs' });
    vi.advanceTimersByTime(5000);
    expect(store.save).not.toHaveBeenCalled();
  });

  it('clears the buffer and the stored entries', async () => {
    const store = fakeStore();
    uninstall = installLogPersistence(store);
    logger.warn('kept.warn');
    await clearAllLogs();
    expect(logger.recent()).toEqual([]);
    expect(earlierLogEntries()).toEqual([]);
    expect(store.save).toHaveBeenLastCalledWith([]);
    vi.advanceTimersByTime(5000);
    expect(store.save).toHaveBeenCalledTimes(1);
  });
});
