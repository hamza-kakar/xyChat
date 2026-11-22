/**
 * Persistent-storage wrapper tests (§12.9, §22 M3).
 */
import { describe, expect, it, vi } from 'vitest';
import { estimateStorage, isStoragePersisted, requestPersistentStorage } from './persistence';

describe('persistent storage (§12.9)', () => {
  it('requests persistence and reports the grant', async () => {
    const persist = vi.fn(() => Promise.resolve(true));
    vi.stubGlobal('navigator', { storage: { persist, persisted: () => Promise.resolve(true) } });
    expect(await requestPersistentStorage()).toBe(true);
    expect(await isStoragePersisted()).toBe(true);
    expect(persist).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it('returns false when denied', async () => {
    vi.stubGlobal('navigator', {
      storage: { persist: () => Promise.resolve(false), persisted: () => Promise.resolve(false) },
    });
    expect(await requestPersistentStorage()).toBe(false);
    vi.unstubAllGlobals();
  });

  it('returns false when the API throws (§0.6)', async () => {
    vi.stubGlobal('navigator', {
      storage: {
        persist: () => Promise.reject(new Error('no')),
        persisted: () => Promise.reject(new Error('no')),
      },
    });
    expect(await requestPersistentStorage()).toBe(false);
    expect(await isStoragePersisted()).toBe(false);
    vi.unstubAllGlobals();
  });
});

describe('storage estimate (§12.9)', () => {
  it('reports usage and quota, with zero for missing fields', async () => {
    vi.stubGlobal('navigator', {
      storage: { estimate: () => Promise.resolve({ usage: 10 }) },
    });
    expect(await estimateStorage()).toEqual({ usage: 10, quota: 0 });
    vi.unstubAllGlobals();
  });

  it('returns null when the API throws', async () => {
    vi.stubGlobal('navigator', {
      storage: { estimate: () => Promise.reject(new Error('no')) },
    });
    expect(await estimateStorage()).toBeNull();
    vi.unstubAllGlobals();
  });
});
