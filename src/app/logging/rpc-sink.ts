/**
 * Logger-backed sink for failed worker RPCs: the client
 * layer cannot import the logger, so the app registers this sink at
 * boot and every failed call is logged with its code, method and diagnostic
 * id — never with message content or file names.
 */
import { setRpcErrorSink } from '../../client/db-client';
import { setImportErrorSink } from '../../client/import-client';
import { setAudioRpcErrorSink } from '../../client/audio-client';
import type { RpcErrorEvent } from '../../client/rpc-call';
import { logger } from './logger';

/** Forwards one failed RPC to the logger (structured payloads). */
export function rpcErrorSink(event: RpcErrorEvent): void {
  logger.warn('rpc.failed', {
    code: event.code,
    method: event.method,
    diagnosticId: event.diagnosticId,
    detail: event.detail,
  });
}

/** Registers the logger-backed sink on every worker client (db, import,
 * audio). Called once at app boot (main.tsx). */
export function installRpcErrorSink(): void {
  setRpcErrorSink(rpcErrorSink);
  setImportErrorSink(rpcErrorSink);
  setAudioRpcErrorSink(rpcErrorSink);
}
