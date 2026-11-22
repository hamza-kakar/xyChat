import { afterEach, describe, expect, it, vi } from 'vitest';
import { ObjectUrlCache, readStoredFile } from './media-url';

function factory() {
  let next = 0;
  const revoked: string[] = [];
  return {
    revoked,
    urls: {
      create: () => {
        next += 1;
        return `blob:${String(next)}`;
      },
      revoke: (url: string) => {
        revoked.push(url);
      },
    },
  };
}

describe('ObjectUrlCache', () => {
  it('returns the cached URL for a path instead of creating another', () => {
    const { urls } = factory();
    const cache = new ObjectUrlCache(2, urls);
    const first = cache.put('a', new Blob(['a']));
    expect(cache.put('a', new Blob(['a']))).toBe(first);
    expect(cache.get('a')).toBe(first);
    expect(cache.size).toBe(1);
  });

  it('evicts and revokes the least recently used URL', () => {
    const { urls, revoked } = factory();
    const cache = new ObjectUrlCache(2, urls);
    const a = cache.put('a', new Blob(['a']));
    cache.put('b', new Blob(['b']));
    cache.get('a');
    cache.put('c', new Blob(['c']));
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('a')).toBe(a);
    expect(revoked).toEqual(['blob:2']);
  });

  it('revokes everything on clear', () => {
    const { urls, revoked } = factory();
    const cache = new ObjectUrlCache(5, urls);
    cache.put('a', new Blob(['a']));
    cache.put('b', new Blob(['b']));
    cache.clear();
    expect(cache.size).toBe(0);
    expect(revoked).toEqual(['blob:1', 'blob:2']);
  });
});

describe('readStoredFile', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubDirectory(files: Record<string, string>): void {
    const directory = (prefix: string): unknown => ({
      getDirectoryHandle: (name: string) => {
        const path = `${prefix}${name}/`;
        if (!Object.keys(files).some((key) => key.startsWith(path))) {
          return Promise.reject(new DOMException('missing', 'NotFoundError'));
        }
        return Promise.resolve(directory(path));
      },
      getFileHandle: (name: string) => {
        const content = files[`${prefix}${name}`];
        return content === undefined
          ? Promise.reject(new DOMException('missing', 'NotFoundError'))
          : Promise.resolve({ getFile: () => Promise.resolve(new File([content], name)) });
      },
    });
    vi.stubGlobal('navigator', {
      storage: { getDirectory: () => Promise.resolve(directory('')) },
    });
  }

  it('walks the directories and returns the file', async () => {
    stubDirectory({ 'thumbs/chat-1/a.jpg': 'jpeg' });
    const file = await readStoredFile('thumbs/chat-1/a.jpg');
    expect(await file?.text()).toBe('jpeg');
  });

  it('returns null for a missing file or a traversal path', async () => {
    stubDirectory({ 'thumbs/chat-1/a.jpg': 'jpeg' });
    await expect(readStoredFile('thumbs/chat-1/b.jpg')).resolves.toBeNull();
    await expect(readStoredFile('thumbs/../a.jpg')).resolves.toBeNull();
    await expect(readStoredFile('')).resolves.toBeNull();
  });
});
