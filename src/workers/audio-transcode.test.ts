import { describe, expect, it } from 'vitest';
import { transcodeOpusToWav, type DecodedAudio, type OpusStreamDecoder } from './audio-transcode';

/** In-memory positional sink. */
function memorySink(failAt: number | null = null) {
  const writes: { at: number; bytes: Uint8Array }[] = [];
  return {
    writes,
    writeAt(bytes: Uint8Array, at: number) {
      if (failAt !== null && writes.length >= failAt) {
        throw new Error('quota');
      }
      writes.push({ at, bytes });
    },
  };
}

function block(samples: number, channels: number): DecodedAudio {
  return {
    channelData: Array.from({ length: channels }, () => new Float32Array(samples).fill(0.25)),
    samplesDecoded: samples,
    sampleRate: 48_000,
  };
}

function fakeDecoder(blocks: readonly DecodedAudio[], options: { failOn?: number } = {}) {
  let index = 0;
  const state = { freed: false };
  const decoder: OpusStreamDecoder = {
    ready: Promise.resolve(),
    decode: () => {
      if (options.failOn === index) {
        throw new Error('corrupt');
      }
      const next = blocks[index] ?? block(0, 1);
      index += 1;
      return next;
    },
    flush: () => Promise.resolve(block(0, 0)),
    free: () => {
      state.freed = true;
    },
  };
  return { decoder, state };
}

async function* chunks(count: number): AsyncGenerator<Uint8Array> {
  for (let i = 0; i < count; i += 1) {
    await Promise.resolve();
    yield new Uint8Array([i]);
  }
}

describe('opus → WAV transcoding', () => {
  it('streams PCM after the header and writes the header last', async () => {
    const sink = memorySink();
    const { decoder, state } = fakeDecoder([block(480, 1), block(0, 1), block(480, 1)]);
    const result = await transcodeOpusToWav({ chunks: chunks(3), decoder, sink });
    expect(result).toEqual({ ok: true, value: { durationMs: 20, dataBytes: 1920 } });
    expect(sink.writes.map((write) => write.at)).toEqual([44, 1004, 0]);
    const header = sink.writes.at(-1)?.bytes ?? new Uint8Array();
    expect(new DataView(header.buffer).getUint32(40, true)).toBe(1920);
    expect(new DataView(header.buffer).getUint16(22, true)).toBe(1);
    expect(state.freed).toBe(true);
  });

  it("keeps the first block's channel count", async () => {
    const sink = memorySink();
    const { decoder } = fakeDecoder([block(10, 2), block(10, 1)]);
    const result = await transcodeOpusToWav({ chunks: chunks(2), decoder, sink });
    expect(result.ok && result.value.dataBytes).toBe(80);
  });

  it('reports a decoder error and frees the decoder', async () => {
    const { decoder, state } = fakeDecoder([block(10, 1)], { failOn: 1 });
    const result = await transcodeOpusToWav({ chunks: chunks(3), decoder, sink: memorySink() });
    expect(result).toEqual({ ok: false, error: 'DECODE_FAILED' });
    expect(state.freed).toBe(true);
  });

  it('reports a failed flush as a decode failure', async () => {
    const { decoder } = fakeDecoder([block(10, 1)]);
    const failing = { ...decoder, flush: () => Promise.reject(new Error('bad page')) };
    const result = await transcodeOpusToWav({
      chunks: chunks(1),
      decoder: failing,
      sink: memorySink(),
    });
    expect(result).toEqual({ ok: false, error: 'DECODE_FAILED' });
  });

  it('reports write failures for payload and header', async () => {
    const payload = await transcodeOpusToWav({
      chunks: chunks(1),
      decoder: fakeDecoder([block(10, 1)]).decoder,
      sink: memorySink(0),
    });
    expect(payload).toEqual({ ok: false, error: 'WRITE_FAILED' });
    const header = await transcodeOpusToWav({
      chunks: chunks(1),
      decoder: fakeDecoder([block(10, 1)]).decoder,
      sink: memorySink(1),
    });
    expect(header).toEqual({ ok: false, error: 'WRITE_FAILED' });
  });

  it('rejects a stream without samples', async () => {
    const result = await transcodeOpusToWav({
      chunks: chunks(2),
      decoder: fakeDecoder([]).decoder,
      sink: memorySink(),
    });
    expect(result).toEqual({ ok: false, error: 'EMPTY_AUDIO' });
  });
});
