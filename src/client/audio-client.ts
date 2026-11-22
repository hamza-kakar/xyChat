/**
 * Typed client for the audio decode worker (AGENTS.md §3.1, §13.2). The
 * worker is spawned on first use only, so engines that play Opus never
 * load the decoder. Calls run through the shared RPC caller with a long
 * timeout: a voice note of several minutes takes seconds to decode.
 */
import * as Comlink from 'comlink';
import { createRpcCaller, type RpcErrorSink } from './rpc-call';
import type { AudioWorkerApi } from '../workers/audio-api';

/** The decode outcome as the app sees it. */
export type AudioDecodeResult = Awaited<ReturnType<AudioWorkerApi['decodeToWav']>>;

let api: Comlink.Remote<AudioWorkerApi> | null = null;

function remote(): Comlink.Remote<AudioWorkerApi> {
  if (api === null) {
    const worker = new Worker(new URL('../workers/audio.worker.ts', import.meta.url), {
      type: 'module',
    });
    api = Comlink.wrap<AudioWorkerApi>(worker);
  }
  return api;
}

/** Decoding is bounded by the voice note's length, not by the database. */
const DECODE_TIMEOUT_MS = 120_000;

const caller = createRpcCaller({
  ensureReady: () => Promise.resolve(true),
  timeoutMs: DECODE_TIMEOUT_MS,
  exempt: new Set<string>(),
});

/** Registers the failure sink (logger-backed, from the app layer §3.1). */
export function setAudioRpcErrorSink(sink: RpcErrorSink | null): void {
  caller.setSink(sink);
}

/** The main-thread audio client. */
export const audioClient = {
  /** The cached WAV of a voice note, decoding it first when needed. */
  decodeToWav: (input: Parameters<AudioWorkerApi['decodeToWav']>[0]) =>
    caller.call<AudioDecodeResult>(() => remote().decodeToWav(input), 'decodeToWav'),
};
