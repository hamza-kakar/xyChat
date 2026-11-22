/**
 * Object URL for a stored media file (§10.4): served from the shared LRU
 * cache, read from OPFS on a miss. Null while loading or when the file is
 * missing.
 */
import { useEffect, useState } from 'react';
import { mediaUrlCache, readStoredFile } from '../../platform/media-url';

export function useMediaUrl(path: string | null): string | null {
  const [loaded, setLoaded] = useState<{ readonly path: string; readonly url: string } | null>(
    null,
  );
  const cached = path === null ? undefined : mediaUrlCache.get(path);

  useEffect(() => {
    if (path === null || cached !== undefined) {
      return undefined;
    }
    let active = true;
    void readStoredFile(path).then((file) => {
      if (active && file !== null) {
        setLoaded({ path, url: mediaUrlCache.put(path, file) });
      }
    });
    return () => {
      active = false;
    };
  }, [path, cached]);

  if (cached !== undefined) {
    return cached;
  }
  return loaded !== null && loaded.path === path ? loaded.url : null;
}
