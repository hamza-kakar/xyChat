/**
 * Import media phase failure and progress tests (§9.1, §9.2 steps 8–9,
 * §9.3, §9.4): a write that throws mid-entry becomes a typed error with
 * every touched path deleted, paths are flushed before their file exists,
 * oversized images get no thumbnail, and both phase bars are determinate.
 */
import { describe, expect, it } from 'vitest';
import { ok, err } from '../core/result';
import { IMPORT_LIMITS } from '../core/limits';
import { writeImportMedia, type MediaPhaseDeps } from './import-media';
import type { ImportProgressEvent } from './import-progress';
import type { InsertableMessage } from '../storage/sqlite/import-commit';
import type { ParsedMessage, ParsedAttachmentRef } from '../core/model';

const CHAT_ID = 'chat-1';
const CHUNKS_PER_ENTRY = 4;

function mediaMessage(fingerprint: string, attachment: ParsedAttachmentRef): InsertableMessage {
  const message: ParsedMessage = {
    seq: 0,
    sourceLine: 1,
    timestamp: { year: 2026, month: 11, day: 17, hour: 21, minute: 0, second: 0 },
    author: 'Sara',
    kind: 'media',
    body: '',
    isEdited: false,
    attachment,
    poll: null,
    location: null,
  };
  return { fingerprint, message };
}

const referenced = (fingerprint: string, fileName: string): InsertableMessage =>
  mediaMessage(fingerprint, { fileName, mediaType: 'image', status: 'referenced' });

const omitted = (fingerprint: string): InsertableMessage =>
  mediaMessage(fingerprint, { fileName: null, mediaType: 'video', status: 'omitted' });

interface Knobs {
  readonly zip: ReadonlyMap<string, number>;
  /** Throw from the sink on this 1-based chunk of this 1-based opened file. */
  readonly throwOn?: { readonly file: number; readonly chunk: number; readonly name: string };
  readonly thumbnail?: () => Promise<{ data: Uint8Array; width: number; height: number } | null>;
}

interface Recorder {
  readonly deleted: string[];
  readonly flushes: (readonly string[])[];
  readonly buffered: string[];
  readonly progress: ImportProgressEvent[];
  /** For each path: was it in the latest flush when its first chunk landed? */
  readonly flushedBeforeFirstWrite: Map<string, boolean>;
}

function harness(knobs: Knobs): { deps: MediaPhaseDeps; rec: Recorder } {
  const rec: Recorder = {
    deleted: [],
    flushes: [],
    buffered: [],
    progress: [],
    flushedBeforeFirstWrite: new Map(),
  };
  let opened = 0;
  const deps: MediaPhaseDeps = {
    archive: {
      listEntries: () => Promise.resolve(ok([])),
      streamEntry: async (name, sink) => {
        if (!knobs.zip.has(name)) {
          return err({ code: 'ENTRY_NOT_FOUND' as const, detail: 'absent' });
        }
        let total = 0;
        for (let index = 0; index < CHUNKS_PER_ENTRY; index += 1) {
          const chunk = new Uint8Array([index]);
          total += chunk.byteLength;
          await sink(chunk);
        }
        return ok({ bytes: total });
      },
      readEntry: () => Promise.resolve(ok(new Uint8Array())),
      close: () => Promise.resolve(),
    },
    listEntries: () => Promise.resolve(ok([...knobs.zip].map(([name, size]) => ({ name, size })))),
    openWriteSink: (path) => {
      opened += 1;
      const fileNumber = opened;
      let chunks = 0;
      return Promise.resolve(
        ok({
          write: () => {
            chunks += 1;
            if (chunks === 1) {
              rec.flushedBeforeFirstWrite.set(path, rec.flushes.at(-1)?.includes(path) === true);
            }
            const fail = knobs.throwOn;
            if (fail?.file === fileNumber && fail.chunk === chunks) {
              const error = new Error('simulated');
              error.name = fail.name;
              return Promise.reject(error);
            }
            return Promise.resolve();
          },
          close: () => Promise.resolve(),
        }),
      );
    },
    readEntryBuffered: (name) => {
      rec.buffered.push(name);
      return Promise.resolve(ok(new Uint8Array([1])));
    },
    deleteFile: (path) => {
      rec.deleted.push(path);
      return Promise.resolve(true);
    },
    makeThumbnail: knobs.thumbnail ?? null,
    thumbnailTypes: new Set(['image']),
  };
  return { deps, rec };
}

function run(
  deps: MediaPhaseDeps,
  rec: Recorder,
  messages: readonly InsertableMessage[],
  writtenPaths?: string[],
): ReturnType<typeof writeImportMedia> {
  return writeImportMedia({
    chatId: CHAT_ID,
    messages,
    alreadyStored: new Set(),
    deps,
    hooks: {
      onProgress: (event) => rec.progress.push(event),
      isCancelled: () => false,
      onWrittenPaths: (paths) => {
        rec.flushes.push([...paths]);
      },
    },
    ...(writtenPaths === undefined ? {} : { writtenPaths }),
  });
}

describe('writeImportMedia: write failures (§9.3)', () => {
  it('turns a sink throw mid-entry into a typed error and deletes every touched path', async () => {
    const { deps, rec } = harness({
      zip: new Map([
        ['IMG-0001.jpg', CHUNKS_PER_ENTRY],
        ['IMG-0002.jpg', CHUNKS_PER_ENTRY],
      ]),
      throwOn: { file: 2, chunk: 3, name: 'QuotaExceededError' },
    });
    const shared: string[] = [];
    const result = await run(
      deps,
      rec,
      [referenced('fp-1', 'IMG-0001.jpg'), referenced('fp-2', 'IMG-0002.jpg')],
      shared,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('QUOTA_EXCEEDED');
    }
    // Both the complete first file and the partial second file are deleted.
    expect(shared).toHaveLength(2);
    expect(rec.deleted).toEqual(shared);
    // Every path was flushed before its first chunk was written.
    expect([...rec.flushedBeforeFirstWrite.values()]).toEqual([true, true]);
  });

  it('maps an unexpected throw to INTERNAL with only the error name', async () => {
    const { deps, rec } = harness({
      zip: new Map([['IMG-0001.jpg', CHUNKS_PER_ENTRY]]),
      throwOn: { file: 1, chunk: 1, name: 'TypeError' },
    });
    const result = await run(deps, rec, [referenced('fp-1', 'IMG-0001.jpg')]);
    expect(result).toEqual(err({ code: 'INTERNAL', detail: 'TypeError' }));
    expect(rec.deleted).toHaveLength(1);
  });
});

describe('writeImportMedia: thumbnails and progress (§9.1, §9.4)', () => {
  it('skips the thumbnail for an image over the size cap, without buffering it', async () => {
    const { deps, rec } = harness({
      zip: new Map([['IMG-huge.jpg', IMPORT_LIMITS.maxThumbnailSourceBytes + 1]]),
      thumbnail: () => Promise.resolve({ data: new Uint8Array([9]), width: 1, height: 1 }),
    });
    const result = await run(deps, rec, [referenced('fp-1', 'IMG-huge.jpg')]);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(rec.buffered).toEqual([]);
    expect(result.value.attachments[0]?.status).toBe('present');
    expect(result.value.attachments[0]?.thumbPath).toBeNull();
  });

  it('reports determinate totals for both phases', async () => {
    let calls = 0;
    const { deps, rec } = harness({
      zip: new Map([
        ['IMG-0001.jpg', CHUNKS_PER_ENTRY],
        ['IMG-0002.jpg', CHUNKS_PER_ENTRY],
      ]),
      // The second image can't be decoded.
      thumbnail: () => {
        calls += 1;
        return Promise.resolve(
          calls === 1 ? { data: new Uint8Array([9]), width: 1, height: 1 } : null,
        );
      },
    });
    const result = await run(deps, rec, [
      referenced('fp-1', 'IMG-0001.jpg'),
      referenced('fp-2', 'IMG-0002.jpg'),
      omitted('fp-3'),
      omitted('fp-4'),
      omitted('fp-5'),
    ]);
    expect(result.ok).toBe(true);
    const last = (phase: string): ImportProgressEvent | undefined =>
      rec.progress.filter((event) => event.phase === phase).at(-1);
    expect(last('writing-media')).toMatchObject({ current: 5, total: 5 });
    expect(last('thumbnails')).toMatchObject({ current: 2, total: 2 });
    for (const event of rec.progress) {
      expect(event.current).toBeLessThanOrEqual(event.total);
    }
  });
});
