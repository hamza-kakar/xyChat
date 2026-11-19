/**
 * Media-store tests (AGENTS.md §10.4): page-context async functions. The
 * sync-handle write path runs in workers (§10.4) and is exercised there.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  deleteChatMedia,
  deleteMediaFile,
  listFilesUnder,
  mediaPathFor,
  readMediaFile,
  thumbPathFor,
} from '../../src/storage/media-store';
import type { ChatId } from '../../src/core/ids';

const CHAT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' as ChatId;

beforeEach(async (ctx) => {
  try {
    await navigator.storage.getDirectory();
  } catch {
    ctx.skip();
    return;
  }
  // Clean the media dirs between tests.
  await deleteChatMedia(CHAT);
});

afterEach(async () => {
  await deleteChatMedia(CHAT);
});

describe('media-store paths', () => {
  it('builds canonical paths by attachment id (§10.4)', () => {
    expect(mediaPathFor(CHAT, 'att-1', 'jpg')).toBe(`media/${CHAT}/att-1.jpg`);
    expect(thumbPathFor(CHAT, 'att-1')).toBe(`thumbs/${CHAT}/att-1.jpg`);
  });
});

describe('media-store page-context functions', () => {
  it('reads a missing file as null', async () => {
    expect(await readMediaFile(mediaPathFor(CHAT, 'missing', 'jpg'))).toBeNull();
  });

  it('lists no files under an absent prefix', async () => {
    expect(await listFilesUnder(`media/${CHAT}`)).toEqual([]);
  });

  it('deletes an absent file as false', async () => {
    expect(await deleteMediaFile(mediaPathFor(CHAT, 'missing', 'jpg'))).toBe(false);
  });

  it('deletes chat media (absent dirs → zero removals)', async () => {
    expect(await deleteChatMedia(CHAT)).toBe(0);
  });

  it('reads, lists and deletes real OPFS files (async page API)', async () => {
    // Seed a file via the async OPFS API (writeMediaFile's sync-handle path
    // is worker-only; the bytes are identical for read-side coverage).
    const root = await navigator.storage.getDirectory();
    const mediaDir = await root.getDirectoryHandle('media', { create: true });
    const chatDir = await mediaDir.getDirectoryHandle(CHAT, { create: true });
    const fileHandle = await chatDir.getFileHandle('seed.jpg', { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(new Uint8Array([1, 2, 3, 4]));
    await writable.close();

    const blob = await readMediaFile(mediaPathFor(CHAT, 'seed', 'jpg'));
    expect(blob).not.toBeNull();
    expect(await blob!.arrayBuffer()).toEqual(new Uint8Array([1, 2, 3, 4]).buffer);

    const paths = await listFilesUnder(`media/${CHAT}`);
    expect(paths).toContain(`media/${CHAT}/seed.jpg`);

    expect(await deleteMediaFile(mediaPathFor(CHAT, 'seed', 'jpg'))).toBe(true);
    expect(await readMediaFile(mediaPathFor(CHAT, 'seed', 'jpg'))).toBeNull();
  });
});
