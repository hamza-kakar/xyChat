import { describe, expect, it } from 'vitest';
import { checkCapabilities, type CapabilityFailure } from './capabilities';

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
});
