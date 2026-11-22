/**
 * The audio decode worker's Comlink API (AGENTS.md §13.2), imported
 * TYPE-ONLY by the client (§3.1). The worker turns a stored Ogg Opus voice
 * note into a cached WAV for engines that can't play Opus.
 */
import type { Result } from '../core/result';

/** Why a transcode failed (§18.7: codes only). */
export type TranscodeErrorCode = 'DECODE_FAILED' | 'WRITE_FAILED' | 'EMPTY_AUDIO';

/** Why a decode failed (§18.7: codes only, never content). */
export type AudioDecodeErrorCode = TranscodeErrorCode | 'READ_FAILED' | 'INVALID_INPUT';

/** A playable decoded file. */
export interface DecodedAudioFile {
  /** OPFS path of the cached WAV (`cache/audio/<attachmentId>.wav`). */
  readonly path: string;
  /** Duration when this call decoded it; null when served from cache. */
  readonly durationMs: number | null;
}

/** The audio worker API exposed over Comlink. */
export interface AudioWorkerApi {
  /** Returns the cached WAV for a voice note, decoding it first if needed. */
  decodeToWav(input: {
    attachmentId: string;
    opfsPath: string;
  }): Promise<Result<DecodedAudioFile, AudioDecodeErrorCode>>;
}
