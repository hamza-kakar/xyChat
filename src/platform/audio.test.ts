import { describe, expect, it } from 'vitest';
import {
  canPlayOggOpus,
  interleavePcm16,
  isOggOpusFile,
  OGG_OPUS_TYPE,
  WAV_HEADER_BYTES,
  wavHeader,
} from './audio';

function tag(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(...bytes.slice(offset, offset + 4));
}

describe('opus support', () => {
  it('reads canPlayType: an empty answer means the fallback is needed', () => {
    const asked: string[] = [];
    const probe = (answer: string) => ({
      canPlayType: (type: string) => {
        asked.push(type);
        return answer;
      },
    });
    expect(canPlayOggOpus(probe('maybe'))).toBe(true);
    expect(canPlayOggOpus(probe('probably'))).toBe(true);
    expect(canPlayOggOpus(probe(''))).toBe(false);
    expect(asked).toEqual([OGG_OPUS_TYPE, OGG_OPUS_TYPE, OGG_OPUS_TYPE]);
  });

  it('recognizes opus files by extension or MIME', () => {
    expect(isOggOpusFile('00000012-AUDIO-2026-11-17.OPUS', null)).toBe(true);
    expect(isOggOpusFile('PTT-20261117-WA0001.ogg', null)).toBe(true);
    expect(isOggOpusFile(null, 'audio/ogg')).toBe(true);
    expect(isOggOpusFile('song.m4a', 'audio/mp4')).toBe(false);
    expect(isOggOpusFile(null, null)).toBe(false);
  });
});

describe('WAV encoding', () => {
  it('writes a canonical PCM header', () => {
    const header = wavHeader({ sampleRate: 48_000, channels: 2, dataBytes: 1000 });
    const view = new DataView(header.buffer);
    expect(header).toHaveLength(WAV_HEADER_BYTES);
    expect(tag(header, 0)).toBe('RIFF');
    expect(view.getUint32(4, true)).toBe(1036);
    expect(tag(header, 8)).toBe('WAVE');
    expect(tag(header, 12)).toBe('fmt ');
    expect(view.getUint32(16, true)).toBe(16);
    expect(view.getUint16(20, true)).toBe(1);
    expect(view.getUint16(22, true)).toBe(2);
    expect(view.getUint32(24, true)).toBe(48_000);
    expect(view.getUint32(28, true)).toBe(192_000);
    expect(view.getUint16(32, true)).toBe(4);
    expect(view.getUint16(34, true)).toBe(16);
    expect(tag(header, 36)).toBe('data');
    expect(view.getUint32(40, true)).toBe(1000);
  });

  it('interleaves and clamps samples into 16-bit PCM', () => {
    const left = new Float32Array([0, 1, -1, 2]);
    const right = new Float32Array([0.5, -0.5, -2, 0]);
    const pcm = interleavePcm16([left, right], 4, 2);
    const view = new DataView(pcm.buffer);
    const values = Array.from({ length: 8 }, (_unused, index) => view.getInt16(index * 2, true));
    expect(values).toEqual([0, 16384, 32767, -16384, -32768, -32768, 32767, 0]);
  });

  it('fills a missing channel with silence and honours the sample count', () => {
    const pcm = interleavePcm16([new Float32Array([1, 1, 1])], 2, 2);
    const view = new DataView(pcm.buffer);
    expect(pcm.byteLength).toBe(8);
    expect([view.getInt16(0, true), view.getInt16(2, true)]).toEqual([32767, 0]);
  });
});
