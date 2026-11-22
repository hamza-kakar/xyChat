import { describe, expect, it } from 'vitest';
import { RpcValidationError } from './rpc-validate';
import { MAX_THUMBNAIL_BYTES, rpcMediaInput } from './rpc-validate-media';

const ID = '0f8e2a4c-1111-4222-8333-944455556666';
const CHAT = '1a2b3c4d-1111-4222-8333-944455556666';

function jpeg(size: number): Uint8Array {
  const bytes = new Uint8Array(size);
  bytes[0] = 0xff;
  bytes[1] = 0xd8;
  return bytes;
}

describe('media RPC inputs (§18.5)', () => {
  it('accepts a duration and rejects nonsense', () => {
    expect(rpcMediaInput.duration('m', { attachmentId: ID, durationMs: 4200 })).toEqual({
      attachmentId: ID,
      durationMs: 4200,
    });
    for (const durationMs of [0, -1, 1.5, 86_400_001, Number.NaN]) {
      expect(() => rpcMediaInput.duration('m', { attachmentId: ID, durationMs })).toThrow(
        RpcValidationError,
      );
    }
    expect(() => rpcMediaInput.duration('m', { attachmentId: '', durationMs: 1 })).toThrow(
      RpcValidationError,
    );
  });

  it('accepts a JPEG thumbnail up to 1 MB with the video size', () => {
    const input = { attachmentId: ID, jpeg: jpeg(100), width: 1920, height: 1080 };
    expect(rpcMediaInput.thumbnail('m', input)).toEqual(input);
    const bad = [
      { ...input, jpeg: new Uint8Array(100) },
      { ...input, jpeg: jpeg(2) },
      { ...input, jpeg: jpeg(MAX_THUMBNAIL_BYTES + 1) },
      { ...input, jpeg: [0xff, 0xd8, 0] },
      { ...input, width: 0 },
    ];
    for (const candidate of bad) {
      expect(() => rpcMediaInput.thumbnail('m', candidate)).toThrow(RpcValidationError);
    }
  });

  it('accepts only canonical media paths for decoding', () => {
    const opfsPath = `media/${CHAT}/${ID}.opus`;
    expect(rpcMediaInput.decode('m', { attachmentId: ID, opfsPath })).toEqual({
      attachmentId: ID,
      opfsPath,
    });
    for (const path of [
      `thumbs/${CHAT}/${ID}.jpg`,
      `media/../${ID}.opus`,
      `/media/${CHAT}/${ID}.opus`,
      `media/${CHAT}/${ID}`,
    ]) {
      expect(() => rpcMediaInput.decode('m', { attachmentId: ID, opfsPath: path })).toThrow(
        RpcValidationError,
      );
    }
  });
});
