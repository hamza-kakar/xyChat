/**
 * Import media phase tests (§9.2 steps 8–9, §9.3): classification of
 * present/missing/omitted media, thumbnail generation and degradation,
 * written-path tracking, and rollback on cancel/failure — against injected
 * fakes (§18.4).
 */
import { describe, expect, it } from 'vitest';
import { ok, err } from '../core/result';
import { writeImportMedia, type MediaPhaseDeps, type ImportMediaHooks } from './import-media';
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
  /** 1-based writeFile call number that fails with a quota error (paths
   * carry attachment UUIDs, not original names — §10.4). */
  readonly failWriteCall?: number;
  readonly thumbnail?:
    (() => Promise<{ data: Uint8Array; width: number; height: number } | null>) | null;
  /** When set, the cancel flag flips after N successful writes. */
  readonly cancelAfterWrites?: number;
}

/** The fake harness: deps + hooks + recorded writes/deletes. */
function harness(knobs: FakeKnobs): {
  readonly deps: MediaPhaseDeps;
  readonly hooks: ImportMediaHooks;
  readonly written: readonly string[];
  readonly deleted: readonly string[];
} {
  const written: string[] = [];
  const deleted: string[] = [];
  let writeCount = 0;
  let cancelled = false;
  const deps: MediaPhaseDeps = {
    listEntries: () => Promise.resolve(ok([...knobs.zip].map(([name, size]) => ({ name, size })))),
    readEntry: (name) => {
      if (knobs.zip.has(name)) {
        return Promise.resolve(ok(new TextEncoder().encode(`bytes-of-${name}`)));
      }
      return Promise.resolve(err({ code: 'ENTRY_NOT_FOUND', detail: name }));
    },
    writeFile: (path) => {
      if (knobs.failWriteCall === writeCount + 1) {
        return Promise.resolve(err('simulated quota exceeded'));
      }
      writeCount += 1;
      if (knobs.cancelAfterWrites !== undefined && writeCount >= knobs.cancelAfterWrites) {
        cancelled = true;
      }
      written.push(path);
      return Promise.resolve(ok({ bytes: 10 }));
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
    hooks: { onProgress: () => undefined, isCancelled: () => cancelled },
    written,
    deleted,
  };
}

describe('writeImportMedia: classification (§9.2 steps 8–9)', () => {
  it('writes present media with thumbnail and tracks written paths', async () => {
    const { deps, hooks, written } = harness({
      zip: new Map([['IMG-0001.jpg', 12]]),
      thumbnail: () =>
        Promise.resolve({ data: new TextEncoder().encode('thumb'), width: 100, height: 80 }),
    });
    const result = await writeImportMedia(
      CHAT_ID,
      [referenced('fp-1', 'IMG-0001.jpg')],
      deps,
      hooks,
    );
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

  it('marks referenced-but-absent files missing (§8.6)', async () => {
    const { deps, hooks } = harness({ zip: new Map() });
    const result = await writeImportMedia(
      CHAT_ID,
      [referenced('fp-1', 'IMG-0001.jpg')],
      deps,
      hooks,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.attachments[0]?.status).toBe('missing');
    expect(result.value.writtenPaths).toHaveLength(0);
  });

  it('builds omitted rows without touching storage', async () => {
    const { deps, hooks, written } = harness({ zip: new Map() });
    const result = await writeImportMedia(CHAT_ID, [omitted('fp-1')], deps, hooks);
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
    const result = await writeImportMedia(
      CHAT_ID,
      [referenced('fp-1', 'IMG-0001.jpg')],
      deps,
      hooks,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.attachments[0]?.status).toBe('present');
    expect(result.value.attachments[0]?.thumbPath).toBeNull();
    expect(result.value.writtenPaths).toHaveLength(1);
  });
});

describe('writeImportMedia: rollback (§9.3)', () => {
  it('rolls back written files on cancellation (§9.3)', async () => {
    // The cancel flag flips after the first file's media write: file 1 is
    // written, file 2's write flips it, and the post-item check rolls
    // everything back (§9.3). Paths carry attachment UUIDs (§10.4).
    const { deps, hooks, deleted } = harness({
      zip: new Map([
        ['IMG-0001.jpg', 12],
        ['IMG-0002.jpg', 12],
      ]),
      cancelAfterWrites: 1,
    });
    const result = await writeImportMedia(
      CHAT_ID,
      [referenced('fp-1', 'IMG-0001.jpg'), referenced('fp-2', 'IMG-0002.jpg')],
      deps,
      hooks,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('CANCELLED');
    }
    expect(deleted).toHaveLength(1);
    expect(deleted[0]?.endsWith('.jpg')).toBe(true);
  });

  it('fails with QUOTA_EXCEEDED and rolls back when a media write hits quota', async () => {
    // File 1 writes fine; file 2's media write fails — file 1 must be
    // deleted (§9.3). (A failed THUMBNAIL write degrades instead, §9.2
    // step 9 — only a media write failure fails the phase.)
    const { deps, hooks, deleted } = harness({
      zip: new Map([
        ['IMG-0001.jpg', 12],
        ['IMG-0002.jpg', 12],
      ]),
      failWriteCall: 2,
    });
    const result = await writeImportMedia(
      CHAT_ID,
      [referenced('fp-1', 'IMG-0001.jpg'), referenced('fp-2', 'IMG-0002.jpg')],
      deps,
      hooks,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('QUOTA_EXCEEDED');
    }
    expect(deleted).toHaveLength(1);
    expect(deleted[0]?.endsWith('.jpg')).toBe(true);
  });
});
