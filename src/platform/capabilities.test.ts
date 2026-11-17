import { describe, expect, it } from 'vitest';
import { checkCapabilities } from './capabilities';

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
    expect(report.failures).toEqual(['opfs', 'syncAccessHandle', 'navigatorLocks']);
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
    expect(report.failures).toEqual(['moduleWorkers']);
  });
});
