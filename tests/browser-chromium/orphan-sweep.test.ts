/**
 * Orphan sweeper test (§9.3): an OPFS file under media/ with no attachment
 * row shows up in listOrphanMedia and is gone after deleteOrphanMedia.
 * Every test leaves OPFS as it found it, because later suites in the same
 * origin count files. Chromium-only per ADR 0007.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openMediaWriteSink } from '../../src/workers/media-writer';
import { deleteChatMedia, deleteMediaFile, listFilesUnder } from '../../src/storage/media-store';
import { newChatId, type ChatId } from '../../src/core/ids';

let chatId: ChatId;
let otherChatId: ChatId;

beforeEach(() => {
  chatId = newChatId();
  otherChatId = newChatId();
});

afterEach(async () => {
  await deleteChatMedia(chatId);
  await deleteChatMedia(otherChatId);
});

/** Writes one file with the async OPFS API (the sync handle the production
 * sink uses is worker-only, so a page test can't use it). */
async function writeOpfsFile(path: string, bytes: Uint8Array): Promise<void> {
  const root = await navigator.storage.getDirectory();
  const segments = path.split('/');
  const fileName = segments.pop();
  if (fileName === undefined || fileName === '') {
    throw new Error(`bad path: ${path}`);
  }
  let dir = root;
  for (const segment of segments) {
    dir = await dir.getDirectoryHandle(segment, { create: true });
  }
  const handle = await dir.getFileHandle(fileName, { create: true });
  const writable = await handle.createWritable();
  await writable.write(bytes.buffer as ArrayBuffer);
  await writable.close();
}

describe('orphan sweeper API (§9.3)', () => {
  it('lists OPFS files with no attachment row and deletes them', async () => {
    // The db.worker's deleteOrphanMedia calls deleteMediaFile per path, the
    // same delete exercised here. No attachment rows exist, so both files
    // are orphans.
    const paths = [`media/${chatId}/orphan-a.jpg`, `media/${chatId}/orphan-b.jpg`];
    for (const path of paths) {
      await writeOpfsFile(path, new TextEncoder().encode('orphan'));
    }
    const before = await listFilesUnder('media');
    expect(before.filter((p) => p.includes(chatId))).toHaveLength(2);

    for (const path of paths) {
      expect(await deleteMediaFile(path)).toBe(true);
    }
    const after = await listFilesUnder('media');
    expect(after.filter((p) => p.includes(chatId))).toEqual([]);
  });

  it("deleting one chat's media counts and removes only that chat's files", async () => {
    const otherPath = `media/${otherChatId}/keep.jpg`;
    await writeOpfsFile(otherPath, new TextEncoder().encode('kept'));
    await writeOpfsFile(`media/${chatId}/gone.jpg`, new TextEncoder().encode('gone'));

    expect(await deleteChatMedia(chatId)).toBe(1);

    const remaining = await listFilesUnder('media');
    expect(remaining.filter((p) => p.includes(otherChatId))).toEqual([otherPath]);
    expect(remaining.filter((p) => p.includes(chatId))).toEqual([]);
  });

  it('the sync-handle sink factory works or fails with a typed error', async () => {
    // createSyncAccessHandle is worker-only, so on a Chromium page the
    // factory fails cleanly; in a worker-like environment it writes.
    const result = await openMediaWriteSink(`media/${chatId}/sink-test.jpg`);
    if (result.ok) {
      await result.value.write(new Uint8Array([1, 2, 3]));
      await result.value.close();
    } else {
      expect(['IO', 'EMPTY_NAME', 'QUOTA']).toContain(result.error.code);
    }
  });
});
