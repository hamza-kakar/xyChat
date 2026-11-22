/**
 * Synthetic WhatsApp export fixtures for the import e2e flows (§19.5
 * flows 2–5). Built at test time with zip.js in Node — real zips, real
 * parser input, no committed chat data (§0 rule 9).
 */
import * as zipJs from '@zip.js/zip.js';

/** Builds a zip blob with the given text entries. */
export async function buildZipBlob(entries: Readonly<Record<string, string>>): Promise<Blob> {
  const writer = new zipJs.ZipWriter(new zipJs.BlobWriter('application/zip'));
  for (const [name, content] of Object.entries(entries)) {
    await writer.add(name, new zipJs.TextReader(content));
  }
  return await writer.close();
}

/** An iOS group export: 5 messages, 2 media references (one present, one
 * missing from the archive), a group-event system line, ambiguous-free
 * DMY dates. */
export const IOS_GROUP_TEXT = [
  '‎[17/11/2026, 9:19:00 PM] Sara: welcome to the family chat',
  '‎[17/11/2026, 9:19:30 PM] Ali Khan: ‎Sara created group "Family"',
  '‎[17/11/2026, 9:20:00 PM] Bob: good evening all',
  '‎[17/11/2026, 9:20:30 PM] Bob: ‎<attached: 00000002-VIDEO-2026-11-17-21-20-59.mp4>',
  '‎[17/11/2026, 9:21:00 PM] Sara: ‎<attached: 00000001-PHOTO-2026-11-17-21-20-30.jpg>',
  '‎[17/11/2026, 9:22:00 PM] Ali Khan: ‎video omitted',
].join('\n');

/** iOS message line for row i (unique bodies → unique fingerprints). */
function iosLine(i: number, author: string): string {
  const minute = i % 12 === 0 ? 12 : i % 12;
  return `‎[17/11/2026, ${minute}:${String(i % 60).padStart(2, '0')}:00 PM] ${author}: message body ${i}`;
}

/** A zip whose chat is large enough that the parse-phase cancellation poll
 * (per 1,000 items, §9.3) fires before the commit. */
export async function buildCancellableZip(messageCount: number): Promise<Blob> {
  const authors = ['Sara', 'Ali Khan', 'Bob'];
  const lines: string[] = [];
  for (let i = 0; i < messageCount; i += 1) {
    lines.push(iosLine(i, authors[i % authors.length] ?? 'Sara'));
  }
  return buildZipBlob({ '_chat.txt': lines.join('\n') });
}

/** The §19.5 flow-2 fixture: iOS group export with one media file present. */
export async function buildIosGroupZip(): Promise<Blob> {
  return buildZipBlob({
    '_chat.txt': IOS_GROUP_TEXT,
    '00000001-PHOTO-2026-11-17-21-20-30.jpg': 'fake-jpeg-bytes',
  });
}

/** The §19.5 flow-4 superset: the SAME 6 base messages plus 2 newer ones
 * (one interleaved right after base 1, one at the end). Content-derived
 * fingerprints keep the base 6 as duplicates (§8.10 occurrence counting is
 * per-file, and these bodies are unique). */
export function supersetText(): string {
  return [
    '‎[17/11/2026, 9:19:00 PM] Sara: welcome to the family chat',
    '‎[17/11/2026, 9:19:30 PM] Ali Khan: ‎Sara created group "Family"',
    '‎[17/11/2026, 9:19:45 PM] Ali Khan: newer message inserted after base 1',
    '‎[17/11/2026, 9:20:00 PM] Bob: good evening all',
    '‎[17/11/2026, 9:20:30 PM] Bob: ‎<attached: 00000002-VIDEO-2026-11-17-21-20-59.mp4>',
    '‎[17/11/2026, 9:21:00 PM] Sara: ‎<attached: 00000001-PHOTO-2026-11-17-21-20-30.jpg>',
    '‎[17/11/2026, 9:22:00 PM] Ali Khan: ‎video omitted',
    '‎[17/11/2026, 9:23:00 PM] Bob: newer message at the end',
  ].join('\n');
}

export async function buildSupersetZip(): Promise<Blob> {
  return buildZipBlob({
    '_chat.txt': supersetText(),
    '00000001-PHOTO-2026-11-17-21-20-30.jpg': 'fake-jpeg-bytes',
  });
}

/** The §19.5 flow-3 fixture: ambiguous 05/06/2026 dates (DMY reads as 5
 * June; MDY reads as May 6 — the toggle decides). */
export function ambiguousText(): string {
  return [
    '‎[05/06/2026, 9:15:00 PM] Sara: june fifth in dmy',
    '‎[05/06/2026, 9:16:00 PM] Ali: may sixth in mdy',
    '‎[05/07/2026, 9:17:00 PM] Sara: next day either way',
  ].join('\n');
}

export async function buildAmbiguousZip(): Promise<Blob> {
  return buildZipBlob({ '_chat.txt': ambiguousText() });
}

/** Counts OPFS files under `media/` (chat dirs → attachment files), §9.3
 * flow-5 assertion helper. */
export async function countOpfsMediaFiles(page: {
  readonly evaluate: (fn: () => Promise<number>) => Promise<number>;
}): Promise<number> {
  return page.evaluate(async () => {
    try {
      const root = await navigator.storage.getDirectory();
      const media = await root.getDirectoryHandle('media', { create: false });
      let count = 0;
      for await (const chatName of media.keys()) {
        if (chatName === '') {
          continue;
        }
        const chatDir = await media.getDirectoryHandle(chatName, { create: false });
        for await (const fileName of chatDir.keys()) {
          if (fileName.endsWith('.jpg') || fileName.endsWith('.mp4')) {
            count += 1;
          }
        }
      }
      return count;
    } catch {
      return 0;
    }
  });
}

/** A zip with `count` media messages (referenced, files PRESENT in the zip)
 * — large enough that a mid-import cancel lands inside writing-media
 * (§9.3). Files share tiny bodies; names are unique. */
export async function buildMediaCancelZip(count: number): Promise<Blob> {
  const entries: Record<string, string> = { '_chat.txt': '' };
  const lines: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const minute = i % 12 === 0 ? 12 : i % 12;
    const name = `0000${String(i).padStart(5, '0')}-PHOTO-2026-11-17-21-20-30.jpg`;
    lines.push(
      `‎[17/11/2026, ${minute}:${String(i % 60).padStart(2, '0')}:00 PM] Sara: ‎<attached: ${name}>`,
    );
    entries[name] = `fake jpeg ${i}`;
  }
  entries['_chat.txt'] = lines.join('\n');
  return buildZipBlob(entries);
}
