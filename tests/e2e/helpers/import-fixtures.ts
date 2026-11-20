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
