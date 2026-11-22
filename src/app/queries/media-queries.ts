/**
 * Media queries (AGENTS.md §12.6, §13, §18.4): gallery and link pages with
 * keyset paging, durations measured on first play, and lazily made video
 * thumbnails.
 */
import { useInfiniteQuery } from '@tanstack/react-query';
import { dbClient } from '../../client/db-client';
import { audioClient, type AudioDecodeResult } from '../../client/audio-client';
import type { ChatId } from '../../core/ids';
import type { MediaType } from '../../core/model';
import { MEDIA } from '../config';
import { queryKeys } from './keys';

/** Gallery pages of the given media types, newest first. */
export function useGallery(chatId: ChatId, types: readonly MediaType[], enabled: boolean) {
  return useInfiniteQuery({
    queryKey: queryKeys.gallery(chatId, types),
    queryFn: ({ pageParam }) =>
      dbClient.listAttachments({ chatId, types, cursor: pageParam, limit: MEDIA.PAGE_SIZE }),
    initialPageParam: null as number | null,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled,
  });
}

/** Pages of messages that carry links, newest first. */
export function useLinkMessages(chatId: ChatId, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: queryKeys.links(chatId),
    queryFn: ({ pageParam }) =>
      dbClient.listLinks({ chatId, cursor: pageParam, limit: MEDIA.PAGE_SIZE }),
    initialPageParam: null as number | null,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled,
  });
}

/** Stores a duration measured on first play (§13.2). Fire and forget:
 * the player already shows the measured value. */
export function saveAudioDuration(attachmentId: string, durationMs: number): void {
  // A failed write only means the next play measures again; the RPC
  // sink has already logged it.
  void dbClient.setAttachmentDuration({ attachmentId, durationMs }).catch(() => undefined);
}

/** Saves a lazily made video thumbnail (§13.3); resolves to its stored
 * path, or null. Tiles pick the path up from the session thumbnail store,
 * so no gallery page refetches. */
export function saveVideoThumbnail(input: {
  readonly attachmentId: string;
  readonly jpeg: Uint8Array;
  readonly width: number;
  readonly height: number;
}): Promise<string | null> {
  return dbClient.saveVideoThumbnail(input);
}

/** The cached WAV of a voice note the engine can't play (§13.2),
 * decoding it in the audio worker on first use. */
export function decodeVoiceNote(input: {
  readonly attachmentId: string;
  readonly opfsPath: string;
}): Promise<AudioDecodeResult> {
  return audioClient.decodeToWav(input);
}
