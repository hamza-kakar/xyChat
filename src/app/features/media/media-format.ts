/**
 * Small media display helpers.
 */
import type { LocalDateTime } from '../../../core/model';
import { formatDate } from '../../../core/dates';
import { en } from '../../i18n/en';
import { formatString } from '../../i18n/format-string';
import type { GalleryItemView } from '../../../client/db-client';

const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3600;

/**
 * Formats a playback position as `m:ss` (or `h:mm:ss`).
 *
 * @param seconds Position in seconds; non-finite values show as 0:00.
 * @returns The clock text.
 */
export function formatClock(seconds: number): string {
  const total = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  const hours = Math.floor(total / SECONDS_PER_HOUR);
  const minutes = Math.floor((total % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);
  const secs = String(total % SECONDS_PER_MINUTE).padStart(2, '0');
  return hours > 0
    ? `${String(hours)}:${String(minutes).padStart(2, '0')}:${secs}`
    : `${String(minutes)}:${secs}`;
}

/** The type label of an attachment ("Photo", "Voice note", …). */
export function mediaLabel(item: Pick<GalleryItemView, 'attachment'>): string {
  return en.chatView.mediaLabels[item.attachment.mediaType];
}

/**
 * Spoken label of a gallery item: type, sender and date.
 *
 * @param item The gallery item.
 * @param locale Display locale.
 * @returns E.g. "Photo, Sara, Nov 17, 2026".
 */
export function galleryItemLabel(item: GalleryItemView, locale: string): string {
  return formatString(en.media.itemLabel, {
    label: mediaLabel(item),
    sender: item.message.authorName ?? en.media.unknownSender,
    date: formatDate(item.message.tsLocal, { locale }),
  });
}

/** The wall-clock time of a gallery item's message. */
export function itemDate(item: Pick<GalleryItemView, 'message'>): LocalDateTime {
  return item.message.tsLocal;
}
