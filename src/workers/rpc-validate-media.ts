/**
 * RPC input validation for the media calls (AGENTS.md §13, §18.5): voice
 * note durations, lazily generated video thumbnails and opus decoding.
 * Invalid input throws RpcValidationError (the worker answers
 * INVALID_INPUT).
 */
import {
  instance,
  integer,
  maxLength,
  maxValue,
  minLength,
  minValue,
  number,
  object,
  pipe,
  regex,
  string,
  check,
} from 'valibot';
import { asAttachmentId, type AttachmentId } from '../core/ids';
import { withSchema } from './rpc-validate';

/** Longest duration accepted (24 h), in milliseconds. */
const MAX_DURATION_MS = 86_400_000;
/** Largest thumbnail accepted; real ones are a few tens of KB (§13.3). */
export const MAX_THUMBNAIL_BYTES = 1_048_576;
/** JPEG files start with the SOI marker. */
const JPEG_SOI = [0xff, 0xd8] as const;

const ATTACHMENT_ID = pipe(string(), minLength(1), maxLength(64));
const DIMENSION = pipe(number(), integer(), minValue(1), maxValue(100_000));

const DURATION_INPUT = object({
  attachmentId: ATTACHMENT_ID,
  durationMs: pipe(number(), integer(), minValue(1), maxValue(MAX_DURATION_MS)),
});

const THUMBNAIL_INPUT = object({
  attachmentId: ATTACHMENT_ID,
  jpeg: pipe(
    instance(Uint8Array),
    check(
      (bytes) =>
        bytes.byteLength > JPEG_SOI.length &&
        bytes.byteLength <= MAX_THUMBNAIL_BYTES &&
        bytes[0] === JPEG_SOI[0] &&
        bytes[1] === JPEG_SOI[1],
      'thumbnail must be a JPEG up to 1 MB',
    ),
  ),
  width: DIMENSION,
  height: DIMENSION,
});

/** Stored media paths: `media/<chatId>/<attachmentId>.<ext>` (§10.4). */
const MEDIA_PATH = pipe(
  string(),
  maxLength(200),
  regex(/^media\/[0-9a-f-]{8,64}\/[0-9a-f-]{8,64}\.[a-z0-9]{1,10}$/u, 'not a media path'),
);

const DECODE_INPUT = object({ attachmentId: ATTACHMENT_ID, opfsPath: MEDIA_PATH });

/** A validated video thumbnail. */
export interface ThumbnailInput {
  readonly attachmentId: AttachmentId;
  readonly jpeg: Uint8Array;
  readonly width: number;
  readonly height: number;
}

/** Parsers used by the workers for media calls. */
export const rpcMediaInput = {
  duration(
    method: string,
    input: unknown,
  ): { readonly attachmentId: AttachmentId; readonly durationMs: number } {
    const parsed = withSchema(method, DURATION_INPUT, input);
    return { attachmentId: asAttachmentId(parsed.attachmentId), durationMs: parsed.durationMs };
  },
  thumbnail(method: string, input: unknown): ThumbnailInput {
    const parsed = withSchema(method, THUMBNAIL_INPUT, input);
    return {
      attachmentId: asAttachmentId(parsed.attachmentId),
      jpeg: parsed.jpeg,
      width: parsed.width,
      height: parsed.height,
    };
  },
  decode(
    method: string,
    input: unknown,
  ): { readonly attachmentId: AttachmentId; readonly opfsPath: string } {
    const parsed = withSchema(method, DECODE_INPUT, input);
    return { attachmentId: asAttachmentId(parsed.attachmentId), opfsPath: parsed.opfsPath };
  },
};
