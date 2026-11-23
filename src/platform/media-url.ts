/**
 * Object URLs for stored media. The main thread
 * only READS from OPFS: `getFileHandle(path).getFile()`, then an object
 * URL held in a small LRU cache that revokes on eviction and on clear
 * (route change).
 */

/** Maximum cached object URLs. */
export const OBJECT_URL_CACHE_SIZE = 200;

/** Creates and revokes object URLs (injectable for tests). */
export interface UrlFactory {
  readonly create: (blob: Blob) => string;
  readonly revoke: (url: string) => void;
}

const browserUrls: UrlFactory = {
  create: (blob) => URL.createObjectURL(blob),
  revoke: (url) => {
    URL.revokeObjectURL(url);
  },
};

/** An LRU of object URLs keyed by OPFS path. */
export class ObjectUrlCache {
  private readonly entries = new Map<string, string>();

  constructor(
    private readonly capacity: number = OBJECT_URL_CACHE_SIZE,
    private readonly urls: UrlFactory = browserUrls,
  ) {}

  /** The cached URL for a path (marks it most recently used), if any. */
  get(path: string): string | undefined {
    const url = this.entries.get(path);
    if (url !== undefined) {
      this.entries.delete(path);
      this.entries.set(path, url);
    }
    return url;
  }

  /** Creates and caches a URL for a path, evicting the least recently used. */
  put(path: string, blob: Blob): string {
    const existing = this.get(path);
    if (existing !== undefined) {
      return existing;
    }
    const url = this.urls.create(blob);
    this.entries.set(path, url);
    while (this.entries.size > this.capacity) {
      const oldest = this.entries.keys().next();
      if (oldest.done === true) {
        break;
      }
      const oldestUrl = this.entries.get(oldest.value);
      this.entries.delete(oldest.value);
      if (oldestUrl !== undefined) {
        this.urls.revoke(oldestUrl);
      }
    }
    return url;
  }

  /** Revokes every URL (route change). */
  clear(): void {
    for (const url of this.entries.values()) {
      this.urls.revoke(url);
    }
    this.entries.clear();
  }

  /** Number of cached URLs. */
  get size(): number {
    return this.entries.size;
  }
}

/**
 * Reads a stored file from OPFS by its relative path.
 *
 * @param path A worker-generated path such as `thumbs/<chat>/<id>.jpg`.
 * @returns The file, or null when it is missing or unreadable.
 */
export async function readStoredFile(path: string): Promise<File | null> {
  try {
    let directory = await navigator.storage.getDirectory();
    const segments = path.split('/');
    const name = segments.pop();
    if (name === undefined || name === '' || segments.includes('..')) {
      return null;
    }
    for (const segment of segments) {
      directory = await directory.getDirectoryHandle(segment);
    }
    const handle = await directory.getFileHandle(name);
    return await handle.getFile();
  } catch {
    return null;
  }
}

/** The app-wide media URL cache. */
export const mediaUrlCache = new ObjectUrlCache();
