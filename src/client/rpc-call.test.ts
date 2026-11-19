/**
 * RPC caller tests (§18.8): timeouts carry the method name
 * and diagnostic id, the timer never outlives settlement (no dangling
 * rejection), exempt methods skip the timeout, and every failure is reported
 * to the sink exactly once.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRpcCaller, type RpcErrorEvent } from './rpc-call';

function callerWith(ready = true, exempt: ReadonlySet<string> = new Set<string>()) {
  const events: RpcErrorEvent[] = [];
  const caller = createRpcCaller({
    ensureReady: () => Promise.resolve(ready),
    timeoutMs: 100,
    exempt,
  });
  caller.setSink((event) => {
    events.push(event);
  });
  return { caller, events };
}

/** Applies the fake-timer hooks to the enclosing describe. */
function withFakeTimers(): void {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });
}

describe('rpc caller: timeout regime (§18.8)', () => {
  withFakeTimers();

  it('resolves and clears the timer — no dangling rejection', async () => {
    const { caller } = callerWith();
    const promise = caller.call(() => Promise.resolve('value'), 'listChats');
    await expect(promise).resolves.toBe('value');
    // Advancing past the timeout must not surface a late rejection.
    await vi.advanceTimersByTimeAsync(500);
  });

  it('rejects with TIMEOUT carrying the diagnostic id, reported once', async () => {
    const { caller, events } = callerWith();
    // Resolves far beyond the timeout: the 100 ms timer must win.
    const pending = caller.call(
      () =>
        new Promise<string>((resolve) => {
          setTimeout(() => {
            resolve('late');
          }, 10_000);
        }),
      'search',
    );
    const expectation = expect(pending).rejects.toThrow(
      /^TIMEOUT: search exceeded 100ms \(id [0-9a-z-]+\)$/u,
    );
    await vi.advanceTimersByTimeAsync(150);
    await expectation;
    expect(events).toHaveLength(1);
    expect(events[0]?.code).toBe('TIMEOUT');
    expect(events[0]?.method).toBe('search');
    expect(events[0]?.diagnosticId).not.toBe('');
  });

  it('exempt methods never time out', async () => {
    const { caller } = callerWith(true, new Set(['commitImport']));
    const pending = caller.call(
      () =>
        new Promise<string>((resolve) => {
          setTimeout(() => {
            resolve('done');
          }, 1500);
        }),
      'commitImport',
    );
    // Well past the timeout regime the call must still be pending; the
    // fake timer resolution then completes it.
    await vi.advanceTimersByTimeAsync(1500);
    await expect(pending).resolves.toBe('done');
  });
});

describe('rpc caller: failure reporting (§18.7)', () => {
  withFakeTimers();

  it('wraps INTERNAL failures with the diagnostic id, reported once', async () => {
    const { caller, events } = callerWith();
    const expectation = expect(
      caller.call(() => Promise.reject(new Error('boom')), 'getChat'),
    ).rejects.toThrow(/^INTERNAL: getChat failed \(id [0-9a-z-]+\): boom$/u);
    await expectation;
    expect(events).toHaveLength(1);
    expect(events[0]?.code).toBe('INTERNAL');
    expect(events[0]?.detail).toContain('boom');
  });

  it('reports DB_UNAVAILABLE when the worker fails to boot', async () => {
    const { caller, events } = callerWith(false);
    await expect(caller.call(() => Promise.resolve(1), 'listChats')).rejects.toThrow(
      /^DB_UNAVAILABLE:/u,
    );
    expect(events).toHaveLength(1);
    expect(events[0]?.code).toBe('DB_UNAVAILABLE');
    expect(events[0]?.method).toBe('listChats');
  });
});
