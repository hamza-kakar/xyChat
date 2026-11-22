/**
 * Playable audio for a stored attachment (AGENTS.md §13.2): the stored
 * file itself, or — for Ogg Opus on an engine that can't play it — the
 * WAV decoded by the audio worker and cached in OPFS.
 */
import { canPlayOggOpus, isOggOpusFile } from '../../../platform/audio';
import { readStoredFile } from '../../../platform/media-url';
import { decodeVoiceNote } from '../../queries/media-queries';
import type { AttachmentView } from '../../../client/db-client';

/** A playable file, plus a duration when decoding measured one. */
export interface AudioSource {
  readonly file: Blob;
  readonly durationMs: number | null;
}

let opusSupport: boolean | null = null;

/** Whether this engine plays Ogg Opus (probed once per session). */
export function enginePlaysOggOpus(): boolean {
  opusSupport ??= canPlayOggOpus(document.createElement('audio'));
  return opusSupport;
}

/**
 * Resolves what the player loads.
 *
 * @param attachment A stored audio attachment.
 * @returns The playable file, or null when it can't be read or decoded.
 */
export async function resolveAudioSource(attachment: AttachmentView): Promise<AudioSource | null> {
  const path = attachment.opfsPath;
  if (path === null) {
    return null;
  }
  if (!isOggOpusFile(attachment.fileName, attachment.mime) || enginePlaysOggOpus()) {
    const file = await readStoredFile(path);
    return file === null ? null : { file, durationMs: null };
  }
  const decoded = await decodeVoiceNote({ attachmentId: attachment.id, opfsPath: path });
  if (!decoded.ok) {
    return null;
  }
  const file = await readStoredFile(decoded.value.path);
  return file === null ? null : { file, durationMs: decoded.value.durationMs };
}
