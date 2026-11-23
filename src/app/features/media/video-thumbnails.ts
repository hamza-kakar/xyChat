/**
 * Lazy video thumbnails. When a video tile without a
 * thumbnail shows, the main thread loads the video into an offscreen
 * element, seeks to min(1 s, duration / 2), draws the frame scaled to a
 * 320 px long edge and hands the JPEG to db.worker, which stores it and
 * records `thumb_path`. At most two run at once; a failure leaves the type
 * icon for the rest of the session.
 */
import { useEffect, useSyncExternalStore } from 'react';
import { readStoredFile } from '../../../platform/media-url';
import { saveVideoThumbnail } from '../../queries/media-queries';
import { MEDIA } from '../../config';
import { logger } from '../../logging';

/** A made thumbnail: JPEG bytes and the video's own size. */
export interface VideoFrame {
  readonly jpeg: Uint8Array;
  readonly width: number;
  readonly height: number;
}

/** What a tile needs to ask for a thumbnail. */
export interface VideoThumbRequest {
  readonly attachmentId: string;
  readonly opfsPath: string;
}

type ThumbState =
  { readonly status: 'ready'; readonly path: string } | { readonly status: 'failed' };

/** Waits for one media event, rejecting on `error`. */
function once(target: HTMLVideoElement, event: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = (): void => {
      target.removeEventListener(event, onEvent);
      target.removeEventListener('error', onError);
    };
    const onEvent = (): void => {
      cleanup();
      resolve();
    };
    const onError = (): void => {
      cleanup();
      reject(new Error('video error'));
    };
    target.addEventListener(event, onEvent);
    target.addEventListener('error', onError);
  });
}

/** Encodes a canvas as JPEG bytes. */
function canvasToJpeg(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob === null) {
          reject(new Error('encode failed'));
          return;
        }
        void blob.arrayBuffer().then((buffer) => {
          resolve(new Uint8Array(buffer));
        }, reject);
      },
      'image/jpeg',
      MEDIA.THUMB_QUALITY,
    );
  });
}

/**
 * Grabs a frame from a video file.
 *
 * @param file The stored video.
 * @returns The JPEG and the video's size.
 */
export async function captureVideoFrame(file: Blob): Promise<VideoFrame> {
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'metadata';
  try {
    const metadata = once(video, 'loadedmetadata');
    video.src = url;
    await metadata;
    const { videoWidth: width, videoHeight: height } = video;
    if (width === 0 || height === 0) {
      throw new Error('no video track');
    }
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    const seeked = once(video, 'seeked');
    video.currentTime = Math.min(MEDIA.VIDEO_THUMB_SEEK_S, duration / 2);
    await seeked;
    const scale = Math.min(1, MEDIA.THUMB_MAX_EDGE / Math.max(width, height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext('2d');
    if (context === null) {
      throw new Error('no 2d context');
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    return { jpeg: await canvasToJpeg(canvas), width, height };
  } finally {
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(url);
  }
}

/** Dependencies of the queue (injectable for tests). */
export interface ThumbQueueDeps {
  readonly readFile: (path: string) => Promise<Blob | null>;
  readonly capture: (file: Blob) => Promise<VideoFrame>;
  readonly save: (input: {
    readonly attachmentId: string;
    readonly jpeg: Uint8Array;
    readonly width: number;
    readonly height: number;
  }) => Promise<string | null>;
  readonly concurrency: number;
}

/** Session store of made (or failed) thumbnails with a bounded queue. */
export class VideoThumbnailStore {
  private readonly states = new Map<string, ThumbState>();
  private readonly listeners = new Set<() => void>();
  private readonly pending: VideoThumbRequest[] = [];
  private readonly queued = new Set<string>();
  private running = 0;

  constructor(private readonly deps: ThumbQueueDeps) {}

  /** The thumbnail path made this session, or null. */
  readonly pathOf = (attachmentId: string): string | null => {
    const state = this.states.get(attachmentId);
    return state?.status === 'ready' ? state.path : null;
  };

  /** Subscribes to changes (useSyncExternalStore). */
  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** Queues a thumbnail unless it is made, failed or already queued. */
  request(request: VideoThumbRequest): void {
    const id = request.attachmentId;
    if (this.states.has(id) || this.queued.has(id)) {
      return;
    }
    this.queued.add(id);
    this.pending.push(request);
    this.pump();
  }

  private pump(): void {
    while (this.running < this.deps.concurrency) {
      const next = this.pending.shift();
      if (next === undefined) {
        return;
      }
      this.running += 1;
      void this.make(next).finally(() => {
        this.running -= 1;
        this.queued.delete(next.attachmentId);
        this.pump();
      });
    }
  }

  private async make(request: VideoThumbRequest): Promise<void> {
    let state: ThumbState = { status: 'failed' };
    try {
      const file = await this.deps.readFile(request.opfsPath);
      if (file !== null) {
        const frame = await this.deps.capture(file);
        const path = await this.deps.save({ attachmentId: request.attachmentId, ...frame });
        if (path !== null) {
          state = { status: 'ready', path };
        }
      }
    } catch (error) {
      logger.warn('media.video-thumbnail-failed', {
        code: error instanceof Error ? error.name : 'UNKNOWN',
      });
    }
    this.states.set(request.attachmentId, state);
    for (const listener of this.listeners) {
      listener();
    }
  }
}

/** The app's thumbnail store. */
export const videoThumbnailStore = new VideoThumbnailStore({
  readFile: readStoredFile,
  capture: captureVideoFrame,
  save: saveVideoThumbnail,
  concurrency: MEDIA.VIDEO_THUMB_CONCURRENCY,
});

/**
 * The thumbnail to show for a video: the stored one, else one made this
 * session; asks for one while the tile is mounted.
 *
 * @param attachment The video's id, file and stored thumbnail.
 * @returns A thumbnail path, or null for the type icon.
 */
export function useVideoThumbnail(attachment: {
  readonly id: string;
  readonly opfsPath: string | null;
  readonly thumbPath: string | null;
  readonly status: string;
}): string | null {
  const made = useSyncExternalStore(videoThumbnailStore.subscribe, () =>
    videoThumbnailStore.pathOf(attachment.id),
  );
  const { id, opfsPath, thumbPath, status } = attachment;
  useEffect(() => {
    if (thumbPath === null && opfsPath !== null && status === 'present') {
      videoThumbnailStore.request({ attachmentId: id, opfsPath });
    }
  }, [id, opfsPath, thumbPath, status]);
  return thumbPath ?? made;
}
