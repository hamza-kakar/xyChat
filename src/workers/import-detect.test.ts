/**
 * Import detection phase tests: real zips read by
 * readArchive, formats detected, metadata derived — the exact data the
 * confirmation screen renders.
 */
import { describe, expect, it } from 'vitest';
import * as zipJs from '@zip.js/zip.js';
import { detectExport } from './import-detect';

/** Builds a real in-memory zip with the given text entries. */
async function buildZip(entries: Readonly<Record<string, string>>): Promise<Blob> {
  const writer = new zipJs.ZipWriter(new zipJs.BlobWriter('application/zip'));
  for (const [name, content] of Object.entries(entries)) {
    await writer.add(name, new zipJs.TextReader(content));
  }
  return await writer.close();
}

const IOS_GROUP_TEXT = [
  'Messages and calls are end-to-end encrypted.',
  '[17/11/2026, 9:19:00 PM] Sara: hi all',
  '[17/11/2026, 9:19:30 PM] Ali Khan: ‎Sara created group "Family"',
  '[17/11/2026, 9:20:00 PM] Bob: welcome everyone',
  '[17/11/2026, 9:21:00 PM] Sara: ‎<attached: 00000001-PHOTO-2026-11-17-21-20-30.jpg>',
  '[17/11/2026, 9:22:00 PM] Ali Khan: ‎<attached: 00000009-VIDEO-2026-11-17-21-21-59.mp4>',
].join('\n');

describe('detectExport', () => {
  it('derives participants, group heuristic and media counts from an iOS group zip', async () => {
    const blob = await buildZip({
      '_chat.txt': IOS_GROUP_TEXT,
      '00000001-PHOTO-2026-11-17-21-20-30.jpg': 'jpeg',
    });
    const report = await detectExport('WhatsApp Chat - Family.zip', blob);
    expect(report.ok).toBe(true);
    if (!report.ok) {
      return;
    }
    expect(report.value.title).toBe('Family');
    expect(report.value.isGroup).toBe(true);
    // First-seen order; the group-event actor (line 3) is a system message.
    expect(report.value.participants).toEqual(['Sara', 'Bob', 'Ali Khan']);
    // 5 messages; the encryption banner precedes the first header and is an
    // orphan line, not a message.
    expect(report.value.messagesCount).toBe(5);
    expect(report.value.mediaFilesFound).toBe(1);
    expect(report.value.mediaFilesMissing).toBe(1);
    expect(report.value.format.platform).toBe('ios');
    expect(report.value.format.dateOrder).toBe('DMY');
    expect(report.value.format.clock).toBe('12h');
    expect(report.value.format.hasSeconds).toBe(true);
    expect(report.value.format.sampleMessages.length).toBeGreaterThan(0);
    expect(report.value.archiveBytes).toBe(blob.size);
  });

  it('detects an Android 1:1 export with the "with" title pattern', async () => {
    const text = [
      '17/11/2026, 21:19 - Messages and calls are end-to-end encrypted.',
      '17/11/2026, 21:20 - Sara: hello there',
      '17/11/2026, 21:21 - Ali: hi Sara',
    ].join('\n');
    const blob = await buildZip({ '_chat.txt': text });
    const report = await detectExport('WhatsApp Chat with Sara.zip', blob);
    expect(report.ok).toBe(true);
    if (!report.ok) {
      return;
    }
    expect(report.value.title).toBe('Sara');
    expect(report.value.isGroup).toBe(false);
    expect(report.value.participants).toEqual(['Sara', 'Ali']);
    expect(report.value.format.platform).toBe('android');
    expect(report.value.format.clock).toBe('24h');
    expect(report.value.mediaFilesFound + report.value.mediaFilesMissing).toBe(0);
  });

  it('maps an unreadable format to UNRECOGNIZED_FORMAT', async () => {
    const blob = await buildZip({ '_chat.txt': 'this is not a chat export\n' });
    const report = await detectExport('chat.zip', blob);
    expect(report.ok).toBe(false);
    if (!report.ok) {
      expect(report.error.code).toBe('UNRECOGNIZED_FORMAT');
    }
  });

  it('propagates archive-safety failures (path traversal)', async () => {
    const writer = new zipJs.ZipWriter(new zipJs.BlobWriter('application/zip'));
    await writer.add('../escape.txt', new zipJs.TextReader('x'));
    const blob = await writer.close();
    const report = await detectExport('chat.zip', blob);
    expect(report.ok).toBe(false);
    if (!report.ok) {
      expect(['PATH_TRAVERSAL', 'CORRUPT_ARCHIVE']).toContain(report.error.code);
    }
  });
});
