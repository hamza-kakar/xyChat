/**
 * Ogg Opus → WAV transcoding for engines that can't play voice notes. The source streams through the decoder chunk by
 * chunk and the PCM goes straight to the cache file, so memory holds one
 * chunk's samples at a time; the WAV header is written last, once
 * the sizes are known. Decoder, source and sink are injected for tests.
 */
import { err, ok, type Result } from '../core/result';
import { interleavePcm16, WAV_HEADER_BYTES, wavHeader } from '../platform/audio';
import type { TranscodeErrorCode } from './audio-api';

/** Positional writes into the cache file (media-writer's sink shape). */
export interface RandomAccessSink {
  writeAt(bytes: Uint8Array, at: number): void;
}

/** Decoded samples, one Float32Array per channel. */
export interface DecodedAudio {
  readonly channelData: readonly Float32Array[];
  readonly samplesDecoded: number;
  readonly sampleRate: number;
}

/** The streaming decoder surface used here (ogg-opus-decoder's shape). */
export interface OpusStreamDecoder {
  readonly ready: Promise<void>;
  decode(chunk: Uint8Array): DecodedAudio;
  flush(): Promise<DecodedAudio>;
  free(): void;
}

/** A finished transcode. */
export interface TranscodeOk {
  readonly durationMs: number;
  readonly dataBytes: number;
}

const MS_PER_SECOND = 1000;
/** Opus always decodes at 48 kHz. */
const DEFAULT_SAMPLE_RATE = 48_000;

/** Running output state. */
interface Output {
  channels: number | null;
  sampleRate: number;
  samples: number;
  dataBytes: number;
}

/** Appends one decoded block; throws on a short write. */
function append(output: Output, sink: RandomAccessSink, block: DecodedAudio): void {
  if (block.samplesDecoded === 0) {
    return;
  }
  output.channels ??= Math.max(1, block.channelData.length);
  output.sampleRate = block.sampleRate;
  const pcm = interleavePcm16(block.channelData, block.samplesDecoded, output.channels);
  sink.writeAt(pcm, WAV_HEADER_BYTES + output.dataBytes);
  output.samples += block.samplesDecoded;
  output.dataBytes += pcm.byteLength;
}

/** Decodes every chunk; DECODE_FAILED or WRITE_FAILED on the first error. */
async function decodeAll(
  output: Output,
  input: {
    readonly chunks: AsyncIterable<Uint8Array>;
    readonly decoder: OpusStreamDecoder;
    readonly sink: RandomAccessSink;
  },
): Promise<TranscodeErrorCode | null> {
  const run = async (step: () => DecodedAudio | Promise<DecodedAudio>): Promise<boolean> => {
    let block: DecodedAudio;
    try {
      block = await step();
    } catch {
      return false;
    }
    append(output, input.sink, block);
    return true;
  };
  try {
    await input.decoder.ready;
    for await (const chunk of input.chunks) {
      if (!(await run(() => input.decoder.decode(chunk)))) {
        return 'DECODE_FAILED';
      }
    }
    return (await run(() => input.decoder.flush())) ? null : 'DECODE_FAILED';
  } catch {
    // The sink threw (short write or quota): nothing decodes past it.
    return 'WRITE_FAILED';
  }
}

/**
 * Transcodes an Ogg Opus stream into a 16-bit PCM WAV file.
 *
 * @param input Source chunks, a fresh decoder and an emptied sink. The
 *   decoder is freed here; the caller closes (and on failure deletes) the
 *   sink's file.
 * @returns Duration and PCM size, or a typed failure.
 */
export async function transcodeOpusToWav(input: {
  readonly chunks: AsyncIterable<Uint8Array>;
  readonly decoder: OpusStreamDecoder;
  readonly sink: RandomAccessSink;
}): Promise<Result<TranscodeOk, TranscodeErrorCode>> {
  const output: Output = {
    channels: null,
    sampleRate: DEFAULT_SAMPLE_RATE,
    samples: 0,
    dataBytes: 0,
  };
  try {
    const failure = await decodeAll(output, input);
    if (failure !== null) {
      return err(failure);
    }
  } finally {
    input.decoder.free();
  }
  if (output.channels === null || output.samples === 0) {
    return err('EMPTY_AUDIO');
  }
  try {
    input.sink.writeAt(
      wavHeader({
        sampleRate: output.sampleRate,
        channels: output.channels,
        dataBytes: output.dataBytes,
      }),
      0,
    );
  } catch {
    return err('WRITE_FAILED');
  }
  return ok({
    durationMs: Math.round((output.samples / output.sampleRate) * MS_PER_SECOND),
    dataBytes: output.dataBytes,
  });
}
