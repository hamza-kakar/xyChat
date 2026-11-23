/**
 * Attachment media typing. File names from iOS and Android
 * follow recognizable patterns; everything else falls back to the extension.
 * MIME is derived from a static table — no sniffing.
 */
import type { MediaType } from '../model';

/** Infixes iOS writes into media file names, mapped to media types. */
const IOS_INFIX_TYPES: readonly { readonly infix: string; readonly type: MediaType }[] = [
  { infix: 'PHOTO', type: 'image' },
  { infix: 'VIDEO', type: 'video' },
  { infix: 'STICKER', type: 'sticker' },
  { infix: 'GIF', type: 'gif' },
  { infix: 'AUDIO', type: 'voice' },
];

/** Prefixes Android writes onto media file names, mapped to media types. */
const ANDROID_PREFIX_TYPES: readonly { readonly prefix: string; readonly type: MediaType }[] = [
  { prefix: 'IMG', type: 'image' },
  { prefix: 'VID', type: 'video' },
  { prefix: 'STK', type: 'sticker' },
  { prefix: 'PTT', type: 'voice' },
  { prefix: 'AUD', type: 'audio' },
  { prefix: 'DOC', type: 'document' },
];

/** Extension → media type, consulted when no platform pattern matched. */
const EXTENSION_TYPES: readonly { readonly ext: string; readonly type: MediaType }[] = [
  { ext: 'jpg', type: 'image' },
  { ext: 'jpeg', type: 'image' },
  { ext: 'png', type: 'image' },
  { ext: 'heic', type: 'image' },
  { ext: 'webp', type: 'image' },
  { ext: 'mp4', type: 'video' },
  { ext: 'mov', type: 'video' },
  { ext: '3gp', type: 'video' },
  { ext: 'opus', type: 'voice' },
  { ext: 'ogg', type: 'voice' },
  { ext: 'm4a', type: 'audio' },
  { ext: 'mp3', type: 'audio' },
  { ext: 'aac', type: 'audio' },
  { ext: 'wav', type: 'audio' },
  { ext: 'amr', type: 'audio' },
  { ext: 'vcf', type: 'contact-card' },
  { ext: 'pdf', type: 'document' },
  { ext: 'doc', type: 'document' },
  { ext: 'docx', type: 'document' },
  { ext: 'xls', type: 'document' },
  { ext: 'xlsx', type: 'document' },
  { ext: 'ppt', type: 'document' },
  { ext: 'pptx', type: 'document' },
  { ext: 'txt', type: 'document' },
  { ext: 'zip', type: 'document' },
];

/** MIME for each media type + extension family; falls back by extension. */
const MIME_BY_EXTENSION: Readonly<Record<string, string>> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  heic: 'image/heic',
  webp: 'image/webp',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  '3gp': 'video/3gpp',
  opus: 'audio/ogg',
  ogg: 'audio/ogg',
  m4a: 'audio/mp4',
  mp3: 'audio/mpeg',
  aac: 'audio/aac',
  wav: 'audio/wav',
  amr: 'audio/amr',
  vcf: 'text/vcard',
  pdf: 'application/pdf',
};

const UNKNOWN_TYPE: MediaType = 'other';
const UNKNOWN_MIME = 'application/octet-stream';

/** Returns the lowercased extension of a file name, without the dot. */
function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  return dot < 0 ? '' : fileName.slice(dot + 1).toLowerCase();
}

/**
 * Classifies a media file by its name: iOS infix (`…-PHOTO-…`), then Android
 * prefix (`IMG-…`), then bare extension. A sticker-named `.webp` stays
 * sticker rather than demoting to image.
 *
 * @example
 * mediaTypeForFileName('00000012-PHOTO-2026-11-17-21-19-03.jpg'); // 'image'
 * mediaTypeForFileName('IMG-20261117-WA0001.jpg'); // 'image'
 * mediaTypeForFileName('PTT-20261117-WA0002.opus'); // 'voice'
 */
export function mediaTypeForFileName(fileName: string): MediaType {
  const upper = fileName.toUpperCase();
  for (const { infix, type } of IOS_INFIX_TYPES) {
    if (upper.includes(infix)) {
      return type;
    }
  }
  for (const { prefix, type } of ANDROID_PREFIX_TYPES) {
    if (upper.startsWith(prefix)) {
      return type;
    }
  }
  const ext = extensionOf(fileName);
  const byExtension = EXTENSION_TYPES.find((entry) => entry.ext === ext);
  if (byExtension !== undefined) {
    return byExtension.type;
  }
  return UNKNOWN_TYPE;
}

/**
 * Derives the MIME type from the file extension via a static table.
 *
 * @example
 * mimeForFileName('IMG-20261117-WA0001.jpg'); // 'image/jpeg'
 */
export function mimeForFileName(fileName: string): string {
  const ext = extensionOf(fileName);
  return MIME_BY_EXTENSION[ext] ?? UNKNOWN_MIME;
}
