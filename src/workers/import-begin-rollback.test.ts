/**
 * Pipeline rollback test: when the archive stream rejects partway
 * through the media phase, every file touched so far is deleted and the
 * import fails with a typed error instead of throwing.
 */
import { describe, expect, it } from 'vitest';
import { runPipeline } from './import-begin';
import { ok } from '../core/result';
import type { MediaPhaseDeps } from './import-media';
import type { DetectedFormat } from '../core/parser';

const PHOTO_1 = '00000001-PHOTO-2026-11-17-21-19-00.jpg';
const PHOTO_2 = '00000002-PHOTO-2026-11-17-21-20-00.jpg';
const CHAT_TEXT = [
  `[17/11/2026, 9:19:00 PM] Sara: ‎<attached: ${PHOTO_1}>`,
  `[17/11/2026, 9:20:00 PM] Sara: ‎<attached: ${PHOTO_2}>`,
].join('\n');

const format: DetectedFormat = {
  platform: 'ios',
  headerPatternId: 'ios-bracket',
  dateOrder: 'DMY',
  dateOrderSource: 'unambiguous',
  clock: '12h',
  hasSeconds: true,
  confidence: 1,
  sampleMessages: [],
};

/** Media IO whose archive streams the first photo and rejects on the second. */
function failingMediaIO(): { readonly deps: MediaPhaseDeps; readonly deleted: string[] } {
  const deleted: string[] = [];
  const entries = [
    { name: PHOTO_1, size: 1 },
    { name: PHOTO_2, size: 1 },
  ];
  return {
    deleted,
    deps: {
      archive: {
        listEntries: () => Promise.resolve(ok(entries)),
        streamEntry: async (name, sink) => {
          if (name === PHOTO_2) {
            throw new Error('zip stream broke');
          }
          await sink(new Uint8Array([1]));
          return ok({ bytes: 1 });
        },
        readEntry: () => Promise.resolve(ok(new Uint8Array())),
        close: () => Promise.resolve(),
      },
      listEntries: () => Promise.resolve(ok(entries)),
      openWriteSink: () =>
        Promise.resolve(ok({ write: () => Promise.resolve(), close: () => Promise.resolve() })),
      readEntryBuffered: () => Promise.resolve(ok(new Uint8Array())),
      deleteFile: (path) => {
        deleted.push(path);
        return Promise.resolve(true);
      },
      makeThumbnail: null,
      thumbnailTypes: new Set(),
    },
  };
}

describe('runPipeline rollback during the media phase', () => {
  it('deletes every touched file and fails with INTERNAL when the stream rejects', async () => {
    const { deps, deleted } = failingMediaIO();
    const flushes: (readonly string[])[] = [];
    const result = await runPipeline({
      file: new File(['zip'], 'chat.zip'),
      fileName: 'chat.zip',
      confirmed: {
        format,
        title: 'Sara',
        isGroup: false,
        chatId: 'chat-1',
        alreadyStored: new Set(),
      },
      importId: 'imp-1',
      commitPort: {} as MessagePort,
      hooks: {
        onProgress: () => undefined,
        isCancelled: () => false,
        onWrittenPaths: (paths) => {
          flushes.push([...paths]);
        },
      },
      mediaIO: deps,
      hashBytes: (bytes) =>
        Promise.resolve(new Uint8Array(32).map((_, index) => bytes[index] ?? 0)),
      readArchiveFn: () =>
        Promise.resolve(
          ok({ text: CHAT_TEXT, wasZip: true, replacementChars: 0, uncompressedTotalBytes: 2 }),
        ),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('INTERNAL');
      expect(result.error.detail).not.toContain('zip stream broke');
    }
    // Both media paths were recorded (the second before its stream began)
    // and both are deleted.
    const lastFlush = flushes.at(-1) ?? [];
    expect(lastFlush).toHaveLength(2);
    expect([...deleted].sort()).toEqual([...lastFlush].sort());
  });
});
