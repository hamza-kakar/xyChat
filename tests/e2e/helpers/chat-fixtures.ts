/**
 * Synthetic exports for the chat-view e2e flows (§19.5 flow 17, §22 M4).
 * Generated at test time; no committed chat data (§0 rule 9).
 */
import { buildZipBlob, IOS_GROUP_TEXT } from './import-fixtures';
import * as zipJs from '@zip.js/zip.js';

/** A real 1×1 PNG, so the importer can decode it and store a thumbnail. */
const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

/** The flow-2 iOS group export, with a decodable photo. */
export async function buildIosGroupZipWithImage(): Promise<Blob> {
  const writer = new zipJs.ZipWriter(new zipJs.BlobWriter('application/zip'));
  await writer.add('_chat.txt', new zipJs.TextReader(IOS_GROUP_TEXT));
  await writer.add(
    '00000001-PHOTO-2026-11-17-21-20-30.jpg',
    new zipJs.Uint8ArrayReader(Buffer.from(TINY_PNG_BASE64, 'base64')),
  );
  return await writer.close();
}

/** Android 1:1 chat mixing Urdu (RTL) and English (LTR) messages. */
export async function buildRtlZip(): Promise<Blob> {
  return buildZipBlob({
    '_chat.txt': [
      '17/11/2026, 21:19 - علی: السلام علیکم، کیا حال ہے؟',
      '17/11/2026, 21:20 - Sara: Hello! All good here.',
      '17/11/2026, 21:21 - علی: بہت اچھا 👍',
    ].join('\n'),
  });
}

/** An Android 1:1 export of `count` text messages, spread over days so
 * day separators appear while scrolling (§17 scroll budget). */
export function largeChatText(count: number): string {
  const lines: string[] = [];
  const authors = ['Sara', 'Ali Khan'];
  for (let i = 0; i < count; i += 1) {
    const day = 1 + (Math.floor(i / 400) % 28);
    const month = 1 + (Math.floor(i / 11_200) % 12);
    const minute = i % 60;
    const hour = Math.floor(i / 60) % 24;
    const author = authors[i % 2] ?? 'Sara';
    const body =
      i % 7 === 0
        ? `message ${String(i)} *bold* and a link https://example.com/${String(i)}\nsecond line`
        : `message ${String(i)} with some ordinary words to wrap a little`;
    lines.push(
      `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/2025, ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')} - ${author}: ${body}`,
    );
  }
  return lines.join('\n');
}
