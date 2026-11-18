import { describe, expect, it } from 'vitest';
import { checkCapabilities, WORKER_PROBE_TIMEOUT_MS, type CapabilityFailure } from './capabilities';

describe('checkCapabilities', () => {
  it('reports ok when every probe passes', async () => {
    const report = await checkCapabilities({
      moduleWorkers: () => true,
      webAssembly: () => true,
      opfs: () => true,
      syncAccessHandle: () => true,
      cryptoSubtle: () => true,
      navigatorLocks: () => true,
    });
    expect(report.ok).toBe(true);
    expect(report.failures).toEqual([]);
  });

  it('collects exactly the failed capabilities', async () => {
    const report = await checkCapabilities({
      moduleWorkers: () => true,
      webAssembly: () => true,
      opfs: () => false,
      syncAccessHandle: () => false,
      cryptoSubtle: () => true,
      navigatorLocks: () => false,
    });
    expect(report.ok).toBe(false);
    expect(report.failures).toEqual([
      { id: 'opfs', reason: 'unavailable' },
      { id: 'syncAccessHandle', reason: 'unavailable' },
      { id: 'navigatorLocks', reason: 'unavailable' },
    ]);
  });

  it('supports async probes and preserves capability order', async () => {
    const report = await checkCapabilities({
      moduleWorkers: () => Promise.resolve(false),
      webAssembly: () => true,
      opfs: () => true,
      syncAccessHandle: () => true,
      cryptoSubtle: () => true,
      navigatorLocks: () => true,
    });
    expect(report.failures).toEqual([{ id: 'moduleWorkers', reason: 'unavailable' }]);
  });

  it('accepts structured failure reasons from probes', async () => {
    const report = await checkCapabilities({
      moduleWorkers: () => true,
      webAssembly: () => true,
      opfs: (): CapabilityFailure => ({ id: 'opfs', reason: 'SecurityError' }),
      syncAccessHandle: () => true,
      cryptoSubtle: () => true,
      navigatorLocks: () => true,
    });
    expect(report.failures).toEqual([{ id: 'opfs', reason: 'SecurityError' }]);
  });

  it('does not retry probes that return false', async () => {
    let attempts = 0;
    const report = await checkCapabilities({
      moduleWorkers: () => true,
      webAssembly: () => true,
      opfs: () => {
        attempts += 1;
        return false;
      },
      syncAccessHandle: () => true,
      cryptoSubtle: () => true,
      navigatorLocks: () => true,
    });
    expect(attempts).toBe(1);
    expect(report.failures).toEqual([{ id: 'opfs', reason: 'unavailable' }]);
  });
});

describe('checkCapabilities transient-error retry', () => {
  it('retries thrown probe errors and succeeds on recovery', async () => {
    let attempts = 0;
    const report = await checkCapabilities({
      moduleWorkers: () => true,
      webAssembly: () => true,
      opfs: () => {
        attempts += 1;
        if (attempts < 3) {
          throw new Error('UnknownError: transient');
        }
        return true;
      },
      syncAccessHandle: () => true,
      cryptoSubtle: () => true,
      navigatorLocks: () => true,
    });
    expect(attempts).toBe(3);
    expect(report.ok).toBe(true);
    expect(report.failures).toEqual([]);
  });

  it('gives up after the retry budget and records the last error', async () => {
    let attempts = 0;
    const report = await checkCapabilities({
      moduleWorkers: () => true,
      webAssembly: () => true,
      opfs: () => {
        attempts += 1;
        throw new Error('UnknownError: persistent');
      },
      syncAccessHandle: () => true,
      cryptoSubtle: () => true,
      navigatorLocks: () => true,
    });
    expect(attempts).toBe(3);
    expect(report.ok).toBe(false);
    expect(report.failures).toEqual([{ id: 'opfs', reason: 'UnknownError: persistent' }]);
  });
});

describe('boot budget (review minor 16)', () => {
  it('keeps the worker probe timeout bounded at 5 seconds', () => {
    // The constant is the boot bound: a hung worker is abandoned after 5 s
    // and reported as a failure (timeouts are final - no retry). happy-dom
    // cannot spawn real module workers, so the hung-worker runtime path is
    // exercised in browser mode when M2 lands; this pins the bound itself.
    expect(WORKER_PROBE_TIMEOUT_MS).toBe(5000);
  });
});
