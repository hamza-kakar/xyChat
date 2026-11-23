/**
 * Canonical OPFS media paths (stored by attachment id,
 * never the original name). Pure module, importable from workers and the
 * main thread alike; media-store.ts re-exports for main-thread
 * callers.
 */
import type { ChatId } from '../core/ids';

/** Directory root for media bytes (relative to the OPFS root). */
export const MEDIA_DIR = 'media';
/** Directory root for thumbnails. */
export const THUMBS_DIR = 'thumbs';

/**
 * Builds the canonical OPFS path for an attachment.
 *
 * @param chatId Owning chat.
 * @param attachmentId Attachment id (UUID).
 * @param extension Lowercase extension without the dot.
 * @example
 * mediaPathFor(chatId, 'a1b2c3', 'jpg'); // 'media/<chatId>/a1b2c3.jpg'
 */
export function mediaPathFor(chatId: ChatId, attachmentId: string, extension: string): string {
  return `${MEDIA_DIR}/${chatId}/${attachmentId}.${extension}`;
}

/** Builds the thumbnail path for an attachment. */
export function thumbPathFor(chatId: ChatId, attachmentId: string): string {
  return `${THUMBS_DIR}/${chatId}/${attachmentId}.jpg`;
}

/** Lowercase extension of a file name ('' when none). */
export function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  if (dot <= 0 || dot === fileName.length - 1) {
    return '';
  }
  return fileName.slice(dot + 1).toLowerCase();
}
