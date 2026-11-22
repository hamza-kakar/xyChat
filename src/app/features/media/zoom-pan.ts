/**
 * Zoom and pan math for the image viewer (AGENTS.md §12.6): pure functions
 * over a transform, so pinch, double-tap and pan are unit-tested without
 * pointer events. Coordinates are relative to the viewport centre; the
 * image is fitted inside the viewport at scale 1.
 */

/** Scale and offset of the image (CSS `translate(x, y) scale(s)`). */
export interface Transform {
  readonly scale: number;
  readonly x: number;
  readonly y: number;
}

/** A width and height in CSS pixels. */
export interface Size {
  readonly width: number;
  readonly height: number;
}

/** A point relative to the viewport centre. */
export interface Point {
  readonly x: number;
  readonly y: number;
}

export const IDENTITY: Transform = { scale: 1, x: 0, y: 0 };
export const MIN_SCALE = 1;
export const MAX_SCALE = 5;
/** Scale a double tap zooms to. */
export const DOUBLE_TAP_SCALE = 2.5;

/** Keeps the scale in range and the zoomed image covering the viewport
 * where it can (no panning past its edges). */
export function clampTransform(transform: Transform, viewport: Size, fitted: Size): Transform {
  const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, transform.scale));
  const maxX = Math.max(0, (fitted.width * scale - viewport.width) / 2);
  const maxY = Math.max(0, (fitted.height * scale - viewport.height) / 2);
  return {
    scale,
    x: Math.min(maxX, Math.max(-maxX, transform.x)),
    y: Math.min(maxY, Math.max(-maxY, transform.y)),
  };
}

/**
 * Scales around a fixed point, so the image under the finger stays put.
 *
 * @param transform Current transform.
 * @param nextScale Target scale (clamped by the caller via clampTransform).
 * @param anchor Point relative to the viewport centre.
 */
export function zoomAround(transform: Transform, nextScale: number, anchor: Point): Transform {
  const ratio = nextScale / transform.scale;
  return {
    scale: nextScale,
    x: anchor.x - (anchor.x - transform.x) * ratio,
    y: anchor.y - (anchor.y - transform.y) * ratio,
  };
}

/** Double tap: zoom in at the point, or back out when zoomed. */
export function toggleZoom(transform: Transform, anchor: Point): Transform {
  return transform.scale > MIN_SCALE ? IDENTITY : zoomAround(transform, DOUBLE_TAP_SCALE, anchor);
}

/** The largest size with the image's aspect ratio that fits the viewport. */
export function fitInside(natural: Size, viewport: Size): Size {
  if (natural.width <= 0 || natural.height <= 0) {
    return viewport;
  }
  const scale = Math.min(viewport.width / natural.width, viewport.height / natural.height);
  return { width: natural.width * scale, height: natural.height * scale };
}

/** What a one-finger drag at scale 1 means once released. */
export type SwipeOutcome = 'next' | 'previous' | 'close' | null;

/** Horizontal travel that turns a drag into a swipe (px). */
export const SWIPE_PX = 60;
/** Downward travel that closes the viewer (px). */
export const CLOSE_PX = 100;

/**
 * Reads a released drag: a mostly horizontal one pages (leftward → next,
 * mirrored under RTL), a mostly downward one closes.
 *
 * @param dx Horizontal travel (px, positive rightward).
 * @param dy Vertical travel (px, positive downward).
 * @param isRtl Whether the layout is right-to-left.
 */
export function swipeOutcome(dx: number, dy: number, isRtl: boolean): SwipeOutcome {
  if (Math.abs(dx) > Math.abs(dy)) {
    if (Math.abs(dx) < SWIPE_PX) {
      return null;
    }
    const towardsStart = isRtl ? dx > 0 : dx < 0;
    return towardsStart ? 'next' : 'previous';
  }
  return dy > CLOSE_PX ? 'close' : null;
}
