import { describe, expect, it, vi } from 'vitest';
import { AudioPlaybackStore } from './audio-playback';

function fakeDoc() {
  const listeners: (() => void)[] = [];
  const doc = {
    visibilityState: 'visible' as DocumentVisibilityState,
    addEventListener: (_type: string, listener: () => void) => {
      listeners.push(listener);
    },
  };
  return {
    doc,
    hide: () => {
      doc.visibilityState = 'hidden';
      for (const listener of listeners) listener();
    },
    listeners,
  };
}

describe('global audio controller (§13.2)', () => {
  it('lets one element play at a time', () => {
    const store = new AudioPlaybackStore(null);
    const first = { pause: vi.fn() };
    const second = { pause: vi.fn() };
    store.claim(first);
    store.claim(first);
    expect(first.pause).not.toHaveBeenCalled();
    store.claim(second);
    expect(first.pause).toHaveBeenCalledTimes(1);
    store.release(first);
    store.pauseCurrent();
    expect(second.pause).toHaveBeenCalledTimes(1);
    store.release(second);
    store.pauseCurrent();
    expect(second.pause).toHaveBeenCalledTimes(1);
  });

  it('pauses on hide and listens once', () => {
    const { doc, hide, listeners } = fakeDoc();
    const store = new AudioPlaybackStore(doc);
    const element = { pause: vi.fn() };
    store.claim(element);
    store.claim(element);
    expect(listeners).toHaveLength(1);
    hide();
    expect(element.pause).toHaveBeenCalledTimes(1);
  });
});
