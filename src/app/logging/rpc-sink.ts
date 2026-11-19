/**
 * Logger-backed sink for failed worker RPCs (AGENTS.md §18.7): the client
 * layer cannot import the logger (§3.1), so the app registers this sink at
 * boot and every failed call is logged with its code, method and diagnostic
 * id — never with message content or file names (§15.4).
 */
import { setRpcErrorSink } from '../../client/db-client';
import type { RpcErrorEvent } from '../../client/rpc-call';
import { logger } from './logger';

/** Forwards one failed RPC to the logger (§18.7 structured payloads). */
export function rpcErrorSink(event: RpcErrorEvent): void {
  logger.warn('rpc.failed', {
    code: event.code,
    method: event.method,
    diagnosticId: event.diagnosticId,
    detail: event.detail,
  });
}

/** Registers the logger-backed sink. Called once at app boot (main.tsx). */
export function installRpcErrorSink(): void {
  setRpcErrorSink(rpcErrorSink);
}
