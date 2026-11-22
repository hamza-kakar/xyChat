/**
 * Decoded voice-note cache paths (AGENTS.md §13.2): when the engine can't
 * play Ogg Opus, the decoded WAV is kept at `cache/audio/<attachmentId>.wav`
 * so the next play starts at once. Pure module, importable from workers
 * and the main thread alike (§3.1).
 */

/** Directory of decoded audio (relative to the OPFS root). */
export const AUDIO_CACHE_DIR = 'cache/audio';

/**
 * The cache path of one attachment's decoded audio.
 *
 * @param attachmentId Attachment id (UUID).
 * @returns The OPFS path of its WAV.
 * @example
 * audioCachePathFor('a1b2'); // 'cache/audio/a1b2.wav'
 */
export function audioCachePathFor(attachmentId: string): string {
  return `${AUDIO_CACHE_DIR}/${attachmentId}.wav`;
}
