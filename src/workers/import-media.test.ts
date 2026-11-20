/**
 * Import media phase tests (§9.2 steps 8–9, §9.3): classification of
 * present/missing/omitted media, STREAMED writes through the opened-archive
 * handle, cumulative written-path flushes, skip-stored fingerprints,
 * thumbnail degradation, and rollback on cancel/failure — against injected
 * fakes (§18.4).
 */
import { describe, expect, it } from 'vitest';
import { ok, err } from '../core/result';
import { writeImportMedia, type MediaPhaseDeps, type ImportMediaHooks } from './import-media';
import type { OpenedArchive } from './archive-reader';
import type { InsertableMessage } from '../storage/sqlite/import-commit';
import type { ParsedMessage } from '../core/model';

const CHAT_ID = 'chat-1';

/** A fingerprinted message with a referenced attachment. */
function referenced(fingerprint: string, fileName: string): InsertableMessage {
  const message: ParsedMessage = {
    seq: 0,
    sourceLine: 1,
    timestamp: { year: 2026, month: 11, day: 17, hour: 21, minute: 0, second: 0 },
    author: 'Sara',
    kind: 'media',
    body: '',
    isEdited: false,
    attachment: { fileName, mediaType: 'image', status: 'referenced' },
    poll: null,
    location: null,
  };
  return { fingerprint, message };
}

function omitted(fingerprint: string): InsertableMessage {
  const message: ParsedMessage = {
    seq: 0,
    sourceLine: 1,
    timestamp: { year: 2026, month: 11, day: 17, hour: 21, minute: 1, second: 0 },
    author: 'Sara',
    kind: 'media',
    body: '',
    isEdited: false,
    attachment: { fileName: null, mediaType: 'video', status: 'omitted' },
    poll: null,
    location: null,
  };
  return { fingerprint, message };
}

/** Mutable knobs the fakes read per call. */
interface FakeKnobs {
  readonly zip: ReadonlyMap<string, number>;
  /** 1-based sink-open number that fails with a quota error (paths carry
   * attachment UUIDs, not original names — §10.4). */
  readonly failSinkOpenOn?: number;
  readonly thumbnail?:
    (() => Promise<{ data: Uint8Array; width: number; height: number } | null>) | null;
  /** When set, the cancel flag flips after N successful sink opens. */
  readonly cancelAfterSinkOpens?: number;
}

/** In-memory OpenedArchive fake over the knob's zip (§18.4). */
function fakeArchive(knobs: FakeKnobs): OpenedArchive {
  const byName = new Map([...knobs.zip].map(([name, size]) => [name, size]));
  return {
    listEntries: () => Promise.resolve(ok([...byName].map(([name, size]) => ({ name, size })))),
    streamEntry: (name, sink) => {
      if (!byName.has(name)) {
        return Promise.resolve(err({ code: 'ENTRY_NOT_FOUND' as const, detail: 'absent' }));
      }
      const bytes = new TextEncoder().encode(`bytes-of-${name}`);
      void sink(bytes);
      return Promise.resolve(ok({ bytes: bytes.byteLength }));
    },
    readEntry: (name) => {
      if (!byName.has(name)) {
        return Promise.resolve(err({ code: 'ENTRY_NOT_FOUND' as const, detail: 'absent' }));
      }
      return Promise.resolve(ok(new TextEncoder().encode(`bytes-of-${name}`)));
    },
    close: () => Promise.resolve(),
  };
}

/** The fake harness: deps + hooks + recorded writes/deletes/flushes. */
function harness(knobs: FakeKnobs): {
  readonly deps: MediaPhaseDeps;
  readonly hooks: ImportMediaHooks;
  readonly written: readonly string[];
  readonly deleted: readonly string[];
  readonly flushes: readonly (readonly string[])[];
} {
  const written: string[] = [];
  const deleted: string[] = [];
  const flushes: string[][] = [];
  let sinkOpenCount = 0;
  let cancelled = false;
  const deps: MediaPhaseDeps = {
    archive: fakeArchive(knobs),
    listEntries: () => Promise.resolve(ok([...knobs.zip].map(([name, size]) => ({ name, size })))),
    openWriteSink: (path) => {
      sinkOpenCount += 1;
      if (knobs.failSinkOpenOn !== undefined && sinkOpenCount === knobs.failSinkOpenOn) {
        return Promise.resolve(err('simulated quota exceeded'));
      }
      written.push(path);
      if (knobs.cancelAfterSinkOpens !== undefined && sinkOpenCount >= knobs.cancelAfterSinkOpens) {
        cancelled = true;
      }
      return Promise.resolve(
        ok({ write: () => Promise.resolve(), close: () => Promise.resolve() }),
      );
    },
    readEntryBuffered: (name) => {
      if (knobs.zip.has(name)) {
        return Promise.resolve(ok(new TextEncoder().encode(`bytes-of-${name}`)));
      }
      return Promise.resolve(err({ code: 'ENTRY_NOT_FOUND' as const, detail: 'absent' }));
    },
    deleteFile: (path) => {
      deleted.push(path);
      return Promise.resolve(true);
    },
    makeThumbnail: knobs.thumbnail ?? null,
    thumbnailTypes: new Set(['image', 'sticker']),
  };
  return {
    deps,
    hooks: {
      onProgress: () => undefined,
      isCancelled: () => cancelled,
      onWrittenPaths: (paths) => {
        flushes.push([...paths]);
      },
    },
    written,
    deleted,
    flushes,
  };
}

// eslint-disable-next-line max-lines-per-function -- one grouped classification suite
describe('writeImportMedia: classification (§9.2 steps 8–9)', () => {
  it('streams present media with thumbnail and tracks written paths', async () => {
    const { deps, hooks, written } = harness({
      zip: new Map([['IMG-0001.jpg', 12]]),
      thumbnail: () =>
        Promise.resolve({ data: new TextEncoder().encode('thumb'), width: 100, height: 80 }),
    });
    const result = await writeImportMedia({
      chatId: CHAT_ID,
      messages: [referenced('fp-1', 'IMG-0001.jpg')],
      alreadyStored: new Set(),
      deps,
      hooks,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.writtenPaths).toHaveLength(2);
    const row = result.value.attachments[0];
    expect(row?.status).toBe('present');
    expect(row?.opfsPath).toContain(`${CHAT_ID}/`);
    expect(row?.opfsPath?.endsWith('.jpg')).toBe(true);
    expect(row?.thumbPath).toContain('thumbs/');
    expect(row?.width).toBe(100);
    expect(row?.mime).toBe('image/jpeg');
    expect(written).toHaveLength(2);
  });

  it('skips fingerprints whose media is already stored (§9.2 step 8)', async () => {
    const { deps, hooks, written } = harness({ zip: new Map([['IMG-0001.jpg', 12]]) });
    const result = await writeImportMedia({
      chatId: CHAT_ID,
      messages: [referenced('fp-stored', 'IMG-0001.jpg')],
      alreadyStored: new Set(['fp-stored']),
      deps,
      hooks,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    // No row, no write: the stored attachment stays untouched.
    expect(result.value.attachments).toHaveLength(0);
    expect(result.value.writtenPaths).toHaveLength(0);
    expect(written).toHaveLength(0);
  });

  it('marks referenced-but-absent files missing (§8.6)', async () => {
    const { deps, hooks } = harness({ zip: new Map() });
    const result = await writeImportMedia({
      chatId: CHAT_ID,
      messages: [referenced('fp-1', 'IMG-0001.jpg')],
      alreadyStored: new Set(),
      deps,
      hooks,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.attachments[0]?.status).toBe('missing');
    expect(result.value.writtenPaths).toHaveLength(0);
  });

  it('builds omitted rows without touching storage', async () => {
    const { deps, hooks, written } = harness({ zip: new Map() });
    const result = await writeImportMedia({
      chatId: CHAT_ID,
      messages: [omitted('fp-1')],
      alreadyStored: new Set(),
      deps,
      hooks,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.attachments[0]?.status).toBe('omitted');
    expect(result.value.attachments[0]?.mediaType).toBe('video');
    expect(written).toHaveLength(0);
  });

  it('degrades a failed thumbnail to no thumbnail (§9.2 step 9)', async () => {
    const { deps, hooks } = harness({
      zip: new Map([['IMG-0001.jpg', 12]]),
      thumbnail: () => Promise.resolve(null),
    });
    const result = await writeImportMedia({
      chatId: CHAT_ID,
      messages: [referenced('fp-1', 'IMG-0001.jpg')],
      alreadyStored: new Set(),
      deps,
      hooks,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.attachments[0]?.status).toBe('present');
    expect(result.value.attachments[0]?.thumbPath).toBeNull();
    expect(result.value.writtenPaths).toHaveLength(1);
  });
  // eslint-enable max-lines-per-function -- one grouped classification suite
});

describe('writeImportMedia: written-path flushes (§9.2 step 8, §9.3)', () => {
  it('flushes the CUMULATIVE written-path list after every write', async () => {
    const { deps, hooks, flushes, written } = harness({
      zip: new Map([
        ['IMG-0001.jpg', 12],
        ['IMG-0002.jpg', 12],
      ]),
      thumbnail: () =>
        Promise.resolve({ data: new TextEncoder().encode('thumb'), width: 10, height: 8 }),
    });
    const result = await writeImportMedia({
      chatId: CHAT_ID,
      messages: [referenced('fp-1', 'IMG-0001.jpg'), referenced('fp-2', 'IMG-0002.jpg')],
      alreadyStored: new Set(),
      deps,
      hooks,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    // Every flush is a PREFIX of the final written list (cumulative, never
    // a partial replacement) and the last flush equals it (§9.3).
    for (const flush of flushes) {
      expect(written.slice(0, flush.length)).toEqual(flush);
    }
    expect(flushes.at(-1)).toEqual(written);
    expect(flushes.length).toBeGreaterThanOrEqual(4);
  });
});

describe('writeImportMedia: rollback (§9.3)', () => {
  it('rolls back written files on cancellation', async () => {
    const { deps, hooks, deleted } = harness({
      zip: new Map([
        ['IMG-0001.jpg', 12],
        ['IMG-0002.jpg', 12],
      ]),
      cancelAfterSinkOpens: 1,
    });
    const result = await writeImportMedia({
      chatId: CHAT_ID,
      messages: [referenced('fp-1', 'IMG-0001.jpg'), referenced('fp-2', 'IMG-0002.jpg')],
      alreadyStored: new Set(),
      deps,
      hooks,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('CANCELLED');
    }
    expect(deleted).toHaveLength(1);
    expect(deleted[0]?.endsWith('.jpg')).toBe(true);
  });

  it('fails with QUOTA_EXCEEDED and rolls back when a sink open hits quota', async () => {
    const { deps, hooks, deleted } = harness({
      zip: new Map([
        ['IMG-0001.jpg', 12],
        ['IMG-0002.jpg', 12],
      ]),
      failSinkOpenOn: 2,
    });
    const result = await writeImportMedia({
      chatId: CHAT_ID,
      messages: [referenced('fp-1', 'IMG-0001.jpg'), referenced('fp-2', 'IMG-0002.jpg')],
      alreadyStored: new Set(),
      deps,
      hooks,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('QUOTA_EXCEEDED');
    }
    expect(deleted).toHaveLength(1);
    expect(deleted[0]?.endsWith('.jpg')).toBe(true);
  });
});
