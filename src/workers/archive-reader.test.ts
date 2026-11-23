/**
 * Archive reader tests: real zip archives built
 * with zip.js, read through the same entry point the import worker uses.
 * Storage estimation is injected so the -step-1 quota check runs in
 * Node.
 */
import { describe, expect, it } from 'vitest';
import * as zipJs from '@zip.js/zip.js';
import {
  readArchive,
  openArchive,
  listMediaEntries,
  isSafeEntryName,
  type ArchiveReaderDeps,
} from './archive-reader';

const CHAT_TEXT = '[17/11/2026, 21:19:03 PM] Sara: hello archive test\n';

/** Builds a real in-memory zip with the given entries. */
async function buildZip(
  entries: Readonly<Record<string, string>>,
): Promise<Blob & { readonly name: string }> {
  const writer = new zipJs.ZipWriter(new zipJs.BlobWriter('application/zip'));
  for (const [name, content] of Object.entries(entries)) {
    await writer.add(name, new zipJs.TextReader(content));
  }
  const blob = await writer.close();
  const file = new File([blob], 'export.zip', { type: 'application/zip' }) as Blob & {
    readonly name: string;
  };
  Object.defineProperty(file, 'name', { value: 'export.zip' });
  return file;
}

/** A bare .txt File with the given content. */
function textFile(content: string, name = 'export.txt'): Blob & { readonly name: string } {
  const file = new File([content], name, { type: 'text/plain' }) as Blob & {
    readonly name: string;
  };
  Object.defineProperty(file, 'name', { value: name });
  return file;
}

/** Generous-quota deps (default: quota check always passes). */
const generousDeps: ArchiveReaderDeps = {
  estimateFreeBytes: () => Promise.resolve(Number.MAX_SAFE_INTEGER),
};

/** Quota deps reporting `free` bytes free. */
function depsWithFree(free: number): ArchiveReaderDeps {
  return { estimateFreeBytes: () => Promise.resolve(free) };
}

describe('archive reader: type and size gates', () => {
  it('rejects non-archive extensions', async () => {
    const result = await readArchive(textFile(CHAT_TEXT, 'export.pdf'), 'export.pdf', generousDeps);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('UNSUPPORTED_FILE_TYPE');
    }
  });

  it('rejects a .txt over the size cap', async () => {
    const big = 'x'.repeat(200 * 1024 * 1024 + 1);
    const result = await readArchive(textFile(big), 'big.txt', generousDeps);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('FILE_TOO_LARGE');
    }
  });
});

describe('archive reader: large zip exports', () => {
  it('does not apply the text cap to a zip file as a whole', async () => {
    const zip = await buildZip({ '_chat.txt': CHAT_TEXT });
    // A zip with media is routinely far larger than the 200 MB text cap.
    Object.defineProperty(zip, 'size', { value: 1024 * 1024 * 1024 });
    const result = await readArchive(zip, 'WhatsApp Chat - Big.zip', generousDeps);
    // The faked size makes the zip unreadable later on; what matters is that
    // the size gate itself did not reject it.
    expect(result.ok ? 'ok' : result.error.code).not.toBe('FILE_TOO_LARGE');
  });
});

describe('archive reader: text files', () => {
  it('decodes a plain .txt export', async () => {
    const result = await readArchive(textFile(CHAT_TEXT), 'export.txt', generousDeps);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.text).toBe(CHAT_TEXT);
      expect(result.value.wasZip).toBe(false);
      expect(result.value.replacementChars).toBe(0);
    }
  });

  it('counts replacement characters on invalid UTF-8', async () => {
    const bytes = new Uint8Array([0x5b, 0xff, 0xfe, 0x5d, 0x0a]);
    const file = new File([bytes], 'broken.txt') as Blob & { readonly name: string };
    Object.defineProperty(file, 'name', { value: 'broken.txt' });
    const result = await readArchive(file, 'export.zip', generousDeps);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.replacementChars).toBeGreaterThan(0);
    }
  });

  it('rejects an empty text file', async () => {
    const result = await readArchive(textFile('   \n  '), 'empty.txt', generousDeps);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('NO_CHAT_TEXT_FOUND');
    }
  });
});

describe('archive reader: zip archives', () => {
  it('locates _chat.txt among several text entries', async () => {
    const file = await buildZip({
      'other.txt': 'decoy content',
      '_chat.txt': CHAT_TEXT,
    });
    const result = await readArchive(file, 'export.zip', generousDeps);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.text).toBe(CHAT_TEXT);
      expect(result.value.wasZip).toBe(true);
    }
  });

  it('rejects entries with path-traversal names with a typed error', async () => {
    // zip.js's own reader guard throws on this name (surfaced as
    // CORRUPT_ARCHIVE); our isSafeEntryName is the second line of defense.
    const writer = new zipJs.ZipWriter(new zipJs.BlobWriter('application/zip'));
    await writer.add('../escape.txt', new zipJs.TextReader('x'));
    const blob = await writer.close();
    const traversal = new File([blob], 'export.zip') as Blob & { readonly name: string };
    Object.defineProperty(traversal, 'name', { value: 'export.zip' });
    const result = await readArchive(traversal, 'export.zip', generousDeps);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(['PATH_TRAVERSAL', 'CORRUPT_ARCHIVE']).toContain(result.error.code);
    }
  });

  it('rejects every traversal-shaped name in the safety table', () => {
    const unsafe = [
      '../escape.txt',
      'a/../escape.txt',
      '/absolute.txt',
      'C:\\drive.txt',
      'sub\\..\\windows.txt',
      'nul\u0000byte.txt',
      '',
    ];
    for (const name of unsafe) {
      expect(isSafeEntryName(name), name).toBe(false);
    }
    for (const name of ['_chat.txt', 'media/IMG-0001.jpg', 'WhatsApp Chat - Fam.txt']) {
      expect(isSafeEntryName(name), name).toBe(true);
    }
  });

  it('rejects entries beyond the compression-ratio cap', async () => {
    // 20 MB of NUL bytes deflate to ~20 KB: > 1000:1.
    const bombBody = '\u0000'.repeat(20 * 1024 * 1024);
    const file = await buildZip({ '_chat.txt': CHAT_TEXT, 'bomb.txt': bombBody });
    const result = await readArchive(file, 'export.zip', generousDeps);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('COMPRESSION_RATIO');
    }
  });

  it('fails with NO_CHAT_TEXT_FOUND when no text entry exists', async () => {
    const file = await buildZip({ 'photo.jpg': 'not-text-content' });
    const result = await readArchive(file, 'export.zip', generousDeps);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('NO_CHAT_TEXT_FOUND');
    }
  });
});

describe('archive reader: failure modes', () => {
  it('fails with QUOTA_EXCEEDED when free storage is under 1.1× the archive', async () => {
    const file = await buildZip({ '_chat.txt': CHAT_TEXT });
    const result = await readArchive(file, 'export.zip', depsWithFree(1));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('QUOTA_EXCEEDED');
    }
    // Generous free storage passes.
    const okResult = await readArchive(file, 'export.zip', generousDeps);
    expect(okResult.ok).toBe(true);
  });

  it('reports CORRUPT_ARCHIVE on truncated zip bytes', async () => {
    const file = await buildZip({ '_chat.txt': CHAT_TEXT });
    const buffer = await file.arrayBuffer();
    const truncated = new File(
      [buffer.slice(0, Math.floor(buffer.byteLength / 2))],
      'cut.zip',
    ) as Blob & {
      readonly name: string;
    };
    Object.defineProperty(truncated, 'name', { value: 'cut.zip' });
    const result = await readArchive(truncated, 'cut.zip', generousDeps);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(['CORRUPT_ARCHIVE', 'NO_CHAT_TEXT_FOUND']).toContain(result.error.code);
    }
  });
});

/** The two-entry archive used by the media tests. */
async function mediaZip(): Promise<Blob & { readonly name: string }> {
  return buildZip({
    '_chat.txt': CHAT_TEXT,
    'media/IMG-0001.jpg': 'jpeg-bytes-here',
  });
}

describe('archive reader: entry bytes and media listing', () => {
  it('reads named entry bytes through the opened handle', async () => {
    const opened = await openArchive(await mediaZip());
    expect(opened.ok).toBe(true);
    if (!opened.ok) {
      return;
    }
    const result = await opened.value.readEntry('media/IMG-0001.jpg');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(new TextDecoder().decode(result.value)).toBe('jpeg-bytes-here');
    }
    await opened.value.close();
  });

  it('streams named entries chunk-by-chunk', async () => {
    const opened = await openArchive(await mediaZip());
    expect(opened.ok).toBe(true);
    if (!opened.ok) {
      return;
    }
    const chunks: number[] = [];
    const streamed = await opened.value.streamEntry('media/IMG-0001.jpg', (chunk) => {
      chunks.push(chunk.byteLength);
      return chunk.byteLength;
    });
    expect(streamed.ok).toBe(true);
    if (streamed.ok) {
      expect(streamed.value.bytes).toBe(15);
      expect(chunks.reduce((sum, c) => sum + c, 0)).toBe(15);
    }
    await opened.value.close();
  });

  it('opens a plain-text export as an archive with no media', async () => {
    const opened = await openArchive(new Blob([CHAT_TEXT], { type: 'text/plain' }));
    expect(opened.ok).toBe(true);
    if (!opened.ok) {
      return;
    }
    await expect(opened.value.listEntries()).resolves.toEqual({ ok: true, value: [] });
    const streamed = await opened.value.streamEntry('IMG-0001.jpg', () => 0);
    expect(streamed.ok).toBe(false);
    const read = await opened.value.readEntry('IMG-0001.jpg');
    expect(read.ok).toBe(false);
    await opened.value.close();
  });

  it('answers ENTRY_NOT_FOUND for absent entries', async () => {
    const opened = await openArchive(await mediaZip());
    expect(opened.ok).toBe(true);
    if (!opened.ok) {
      return;
    }
    const result = await opened.value.readEntry('media/missing.jpg');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('ENTRY_NOT_FOUND');
    }
    await opened.value.close();
  });

  it('lists media entries, skipping text and metadata', async () => {
    const result = await listMediaEntries(await mediaZip());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual([{ name: 'media/IMG-0001.jpg', size: 15 }]);
    }
  });
});
