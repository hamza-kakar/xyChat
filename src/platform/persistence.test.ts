/**
 * Persistent-storage wrapper tests (§12.9, §22 M3, review Blocker 4).
 */
import { describe, expect, it, vi } from 'vitest';
import { isStoragePersisted, requestPersistentStorage } from './persistence';

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
