/**
 * Global audio controller: only one voice note or audio
 * file plays at a time, and playback pauses when the app is hidden. A
 * small, clearly named store; players register their element on play.
 */

/** The element-like surface the controller needs. */
export interface Pausable {
  pause(): void;
}

/** The document surface the controller watches. */
export interface VisibilitySource {
  readonly visibilityState: DocumentVisibilityState;
  addEventListener(type: 'visibilitychange', listener: () => void): void;
}

/** Tracks the playing element. */
export class AudioPlaybackStore {
  private current: Pausable | null = null;
  private isWatching = false;

  constructor(private readonly doc: VisibilitySource | null) {}

  /** Marks an element as playing, pausing whichever played before. */
  claim(element: Pausable): void {
    this.watchVisibility();
    if (this.current !== null && this.current !== element) {
      this.current.pause();
    }
    this.current = element;
  }

  /** Forgets an element that paused, ended or unmounted. */
  release(element: Pausable): void {
    if (this.current === element) {
      this.current = null;
    }
  }

  /** Pauses whatever plays (app hidden, viewer closed). */
  pauseCurrent(): void {
    this.current?.pause();
  }

  private watchVisibility(): void {
    const doc = this.doc;
    if (this.isWatching || doc === null) {
      return;
    }
    this.isWatching = true;
    doc.addEventListener('visibilitychange', () => {
      if (doc.visibilityState === 'hidden') {
        this.pauseCurrent();
      }
    });
  }
}

/** The app's audio controller. */
export const audioPlayback = new AudioPlaybackStore(
  typeof document === 'undefined' ? null : document,
);
