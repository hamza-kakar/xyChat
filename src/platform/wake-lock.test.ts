/**
 * Wake-lock wrapper tests (§12.8.5, review Blocker 4): acquires when
 * navigator.wakeLock exists, ok(null) when unsupported, err on rejection.
 */
import { describe, expect, it, vi } from 'vitest';
import { acquireScreenWakeLock } from './wake-lock';

describe('acquireScreenWakeLock (§12.8.5)', () => {
  it('returns a handle that releases when wakeLock is supported', async () => {
    const release = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', {
      wakeLock: { request: vi.fn(() => Promise.resolve({ release })) },
    });
    const result = await acquireScreenWakeLock();
    expect(result.ok).toBe(true);
    if (result.ok && result.value !== null) {
      await result.value.release();
      expect(release).toHaveBeenCalledTimes(1);
    } else {
      throw new Error('expected a handle');
    }
    vi.unstubAllGlobals();
  });

  it('returns ok(null) when wakeLock is unsupported (§0.6)', async () => {
    vi.stubGlobal('navigator', {});
    const result = await acquireScreenWakeLock();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBeNull();
    }
    vi.unstubAllGlobals();
  });

  it('returns err (name only) when the request rejects (§15.4)', async () => {
    vi.stubGlobal('navigator', {
      wakeLock: { request: vi.fn(() => Promise.reject(new Error('denied on SECRET-VALUE'))) },
    });
    const result = await acquireScreenWakeLock();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('Error');
      expect(result.error).not.toContain('SECRET-VALUE');
    }
    vi.unstubAllGlobals();
  });
});
