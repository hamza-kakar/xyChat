/**
 * Voice-note playback support: whether the engine plays
 * Ogg Opus, and a tiny 16-bit PCM WAV encoder for the decoder fallback.
 * Free of DOM types so the decode worker can import it; the probe
 * takes any object with `canPlayType`, such as an `<audio>` element.
 */

/** The MIME type WhatsApp voice notes use. */
export const OGG_OPUS_TYPE = 'audio/ogg; codecs=opus';
/** Size of the canonical WAV header (RIFF + fmt + data chunk headers). */
export const WAV_HEADER_BYTES = 44;

const BYTES_PER_SAMPLE = 2;
const BITS_PER_SAMPLE = 16;
const PCM_FORMAT = 1;
const FMT_CHUNK_BYTES = 16;
/** RIFF size field excludes the 8-byte "RIFF" + size prefix. */
const RIFF_PREFIX_BYTES = 8;
const INT16_MAX = 0x7fff;
const INT16_MIN = -0x8000;

/** Anything that answers `canPlayType`, e.g. an HTMLAudioElement. */
export interface PlayTypeProbe {
  canPlayType(type: string): string;
}

/**
 * True when the engine can play Ogg Opus itself (`''` means no).
 *
 * @param probe An `<audio>` element or compatible object.
 * @returns False when the decoder fallback is needed.
 */
export function canPlayOggOpus(probe: PlayTypeProbe): boolean {
  return probe.canPlayType(OGG_OPUS_TYPE) !== '';
}

/**
 * True when a stored file is Ogg Opus by extension or MIME (voice notes:
 * `.opus`, sometimes `.ogg`).
 *
 * @param fileName Original file name (display only), or null.
 * @param mime Stored MIME type, or null.
 * @returns Whether playback may need the decoder fallback.
 */
export function isOggOpusFile(fileName: string | null, mime: string | null): boolean {
  const lower = fileName?.toLowerCase() ?? '';
  return lower.endsWith('.opus') || lower.endsWith('.ogg') || mime === 'audio/ogg';
}

/** Writes an ASCII tag at a byte offset. */
function writeTag(view: DataView, offset: number, tag: string): void {
  for (let index = 0; index < tag.length; index += 1) {
    view.setUint8(offset + index, tag.charCodeAt(index));
  }
}

/**
 * Builds a canonical 44-byte PCM WAV header.
 *
 * @param format Sample rate, channel count and the PCM data size in bytes.
 * @returns The header bytes (little endian, 16-bit samples).
 * @example
 * wavHeader({ sampleRate: 48000, channels: 1, dataBytes: 96000 }); // 1 s mono
 */
export function wavHeader(format: {
  readonly sampleRate: number;
  readonly channels: number;
  readonly dataBytes: number;
}): Uint8Array {
  const { sampleRate, channels, dataBytes } = format;
  const header = new Uint8Array(WAV_HEADER_BYTES);
  const view = new DataView(header.buffer);
  const blockAlign = channels * BYTES_PER_SAMPLE;
  writeTag(view, 0, 'RIFF');
  view.setUint32(4, WAV_HEADER_BYTES - RIFF_PREFIX_BYTES + dataBytes, true);
  writeTag(view, 8, 'WAVE');
  writeTag(view, 12, 'fmt ');
  view.setUint32(16, FMT_CHUNK_BYTES, true);
  view.setUint16(20, PCM_FORMAT, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, BITS_PER_SAMPLE, true);
  writeTag(view, 36, 'data');
  view.setUint32(40, dataBytes, true);
  return header;
}

/**
 * Interleaves float channels into 16-bit little-endian PCM, clamping to
 * [-1, 1]. A missing channel plays as silence.
 *
 * @param channelData One Float32Array per channel.
 * @param samples Samples per channel to take.
 * @param channels Channel count of the output.
 * @returns PCM bytes ready to append after {@link wavHeader}.
 */
export function interleavePcm16(
  channelData: readonly Float32Array[],
  samples: number,
  channels: number,
): Uint8Array {
  const out = new Uint8Array(samples * channels * BYTES_PER_SAMPLE);
  const view = new DataView(out.buffer);
  let offset = 0;
  for (let sample = 0; sample < samples; sample += 1) {
    for (let channel = 0; channel < channels; channel += 1) {
      const value = Math.max(-1, Math.min(1, channelData[channel]?.[sample] ?? 0));
      const scaled = value < 0 ? value * -INT16_MIN : value * INT16_MAX;
      view.setInt16(offset, Math.round(scaled), true);
      offset += BYTES_PER_SAMPLE;
    }
  }
  return out;
}
