/**
 * Audio decode worker (AGENTS.md §13.2): spawned on the first voice note
 * an engine can't play, so the opus decoder never weighs on the initial
 * bundle. Decodes stay serialized; the cached WAV is reused across
 * sessions and goes with its chat (§10.4).
 */
import * as Comlink from 'comlink';
import { OggOpusDecoder } from 'ogg-opus-decoder';
import { err, ok } from '../core/result';
import { audioCachePathFor } from '../storage/audio-cache';
import { deleteMediaFile, readMediaFile } from '../storage/media-store';
import { openRandomAccessSink } from './media-writer';
import { transcodeOpusToWav } from './audio-transcode';
import type { AudioWorkerApi } from './audio-api';
import { RpcValidationError } from './rpc-validate';
import { rpcMediaInput } from './rpc-validate-media';

/** True when a non-empty cached file exists at the path. */
async function isCached(path: string): Promise<boolean> {
  const file = await readMediaFile(path);
  return file !== null && file.size > 0;
}

/** Streams a Blob as byte chunks. */
async function* chunksOf(blob: Blob): AsyncGenerator<Uint8Array> {
  const reader = blob.stream().getReader();
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) {
        return;
      }
      yield next.value;
    }
  } finally {
    reader.releaseLock();
  }
}

type DecodeResult = Awaited<ReturnType<AudioWorkerApi['decodeToWav']>>;

async function decode(attachmentId: string, opfsPath: string): Promise<DecodeResult> {
  const path = audioCachePathFor(attachmentId);
  if (await isCached(path)) {
    return ok({ path, durationMs: null });
  }
  const source = await readMediaFile(opfsPath);
  if (source === null) {
    return err('READ_FAILED');
  }
  const sink = await openRandomAccessSink(path);
  if (!sink.ok) {
    return err('WRITE_FAILED');
  }
  let result: DecodeResult;
  try {
    const transcoded = await transcodeOpusToWav({
      chunks: chunksOf(source),
      decoder: new OggOpusDecoder(),
      sink: sink.value,
    });
    result = transcoded.ok
      ? ok({ path, durationMs: transcoded.value.durationMs })
      : err(transcoded.error);
  } finally {
    sink.value.close();
  }
  if (!result.ok) {
    // A partial file must never be served as a cache hit.
    await deleteMediaFile(path);
  }
  return result;
}

/** Decodes run one at a time: each holds a decoder and a file handle. */
let queue: Promise<unknown> = Promise.resolve();

const api: AudioWorkerApi = {
  decodeToWav: (input) => {
    const run = async (): Promise<DecodeResult> => {
      try {
        const parsed = rpcMediaInput.decode('decodeToWav', input);
        return await decode(parsed.attachmentId, parsed.opfsPath);
      } catch (error) {
        if (error instanceof RpcValidationError) {
          return err('INVALID_INPUT');
        }
        throw error;
      }
    };
    const next = queue.then(run, run);
    queue = next.catch(() => undefined);
    return next;
  },
};

Comlink.expose(api, self);
