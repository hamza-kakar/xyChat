import { describe, expect, it, vi } from 'vitest';
import { VideoThumbnailStore, type VideoFrame } from './video-thumbnails';

vi.mock('../../logging', () => ({ logger: { warn: vi.fn() } }));
vi.mock('../../queries/media-queries', () => ({ saveVideoThumbnail: vi.fn() }));

const FRAME: VideoFrame = { jpeg: new Uint8Array([1]), width: 640, height: 360 };

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('VideoThumbnailStore', () => {
  it('runs at most the configured number at once and reports made paths', async () => {
    const captures: { resolve: (frame: VideoFrame) => void }[] = [];
    const store = new VideoThumbnailStore({
      readFile: () => Promise.resolve(new Blob(['v'])),
      capture: () => {
        const next = deferred<VideoFrame>();
        captures.push(next);
        return next.promise;
      },
      save: ({ attachmentId }) => Promise.resolve(`thumbs/c/${attachmentId}.jpg`),
      concurrency: 2,
    });
    const listener = vi.fn();
    store.subscribe(listener);
    for (const id of ['a', 'b', 'c', 'a']) {
      store.request({ attachmentId: id, opfsPath: `media/c/${id}.mp4` });
    }
    await vi.waitFor(() => {
      expect(captures).toHaveLength(2);
    });
    captures[0]?.resolve(FRAME);
    await vi.waitFor(() => {
      expect(store.pathOf('a')).toBe('thumbs/c/a.jpg');
    });
    await vi.waitFor(() => {
      expect(captures).toHaveLength(3);
    });
    captures[1]?.resolve(FRAME);
    captures[2]?.resolve(FRAME);
    await vi.waitFor(() => {
      expect(store.pathOf('c')).toBe('thumbs/c/c.jpg');
    });
    expect(listener).toHaveBeenCalledTimes(3);
    // Made thumbnails are not made again.
    store.request({ attachmentId: 'a', opfsPath: 'media/c/a.mp4' });
    expect(captures).toHaveLength(3);
  });

  it('remembers a failure for the session and keeps the type icon', async () => {
    const capture = vi.fn(() => Promise.reject(new Error('no video track')));
    const store = new VideoThumbnailStore({
      readFile: () => Promise.resolve(new Blob(['v'])),
      capture,
      save: () => Promise.resolve('unused'),
      concurrency: 2,
    });
    const listener = vi.fn();
    store.subscribe(listener);
    store.request({ attachmentId: 'x', opfsPath: 'media/c/x.mp4' });
    await vi.waitFor(() => {
      expect(listener).toHaveBeenCalledTimes(1);
    });
    expect(store.pathOf('x')).toBeNull();
    store.request({ attachmentId: 'x', opfsPath: 'media/c/x.mp4' });
    expect(capture).toHaveBeenCalledTimes(1);
  });
});
