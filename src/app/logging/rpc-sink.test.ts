/**
 * RPC failure sink tests: the app registers a logger-backed sink so
 * every failed worker RPC lands in the ring buffer with its code, method and
 * diagnostic id — and never with message content.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { logger } from './logger';

const setRpcErrorSinkMock = vi.hoisted(() => vi.fn());
const setImportErrorSinkMock = vi.hoisted(() => vi.fn());
const setAudioErrorSinkMock = vi.hoisted(() => vi.fn());

vi.mock('../../client/db-client', () => ({
  setRpcErrorSink: (...args: unknown[]) => {
    setRpcErrorSinkMock(...args);
  },
}));

vi.mock('../../client/import-client', () => ({
  setImportErrorSink: (...args: unknown[]) => {
    setImportErrorSinkMock(...args);
  },
}));

vi.mock('../../client/audio-client', () => ({
  setAudioRpcErrorSink: (...args: unknown[]) => {
    setAudioErrorSinkMock(...args);
  },
}));

import { installRpcErrorSink, rpcErrorSink } from './rpc-sink';

describe('logger-backed RPC failure sink', () => {
  beforeEach(() => {
    setRpcErrorSinkMock.mockClear();
    setImportErrorSinkMock.mockClear();
    setAudioErrorSinkMock.mockClear();
  });

  it('registers the sink on every worker client at install', () => {
    installRpcErrorSink();
    expect(setRpcErrorSinkMock).toHaveBeenCalledTimes(1);
    expect(setRpcErrorSinkMock.mock.calls[0]?.[0]).toBe(rpcErrorSink);
    expect(setImportErrorSinkMock).toHaveBeenCalledTimes(1);
    expect(setImportErrorSinkMock.mock.calls[0]?.[0]).toBe(rpcErrorSink);
    expect(setAudioErrorSinkMock.mock.calls[0]?.[0]).toBe(rpcErrorSink);
  });

  it('logs a failed RPC with code, method and diagnostic id', () => {
    const before = logger.recent().length;
    rpcErrorSink({
      code: 'TIMEOUT',
      method: 'search',
      diagnosticId: 'abc-1',
      detail: 'TIMEOUT: search exceeded 10000ms (id abc-1)',
    });
    const entry = logger.recent().at(-1);
    expect(logger.recent().length).toBe(before + 1);
    expect(entry?.level).toBe('warn');
    expect(entry?.code).toBe('rpc.failed');
    expect(entry?.data).toEqual({
      code: 'TIMEOUT',
      method: 'search',
      diagnosticId: 'abc-1',
      detail: 'TIMEOUT: search exceeded 10000ms (id abc-1)',
    });
  });
});
