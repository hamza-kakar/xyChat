/**
 * Full-screen image: pinch zoom, double-tap zoom, pan
 * when zoomed, and — at normal size — swipe sideways between items or down
 * to close. Pointer events only; the transform math lives in `zoom-pan.ts`.
 * Under reduced motion the image moves without transitions.
 */
import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import clsx from 'clsx';
import { en } from '../../i18n/en';
import { useMediaUrl } from '../../hooks/use-media-url';
import {
  IDENTITY,
  MIN_SCALE,
  clampTransform,
  fitInside,
  swipeOutcome,
  toggleZoom,
  zoomAround,
  type Point,
  type Size,
  type SwipeOutcome,
  type Transform,
} from './zoom-pan';

/** Two taps closer together than this (ms) zoom. */
const DOUBLE_TAP_MS = 300;
/** A tap moves less than this (px). */
const TAP_SLOP_PX = 10;

/** Props for {@link ImageViewer}. */
export interface ImageViewerProps {
  readonly path: string | null;
  readonly label: string;
  readonly onSwipe: (outcome: Exclude<SwipeOutcome, null>) => void;
}

interface Gesture {
  readonly start: Point;
  readonly startTransform: Transform;
  readonly startDistance: number;
  /** Pinch midpoint relative to the viewport centre. */
  readonly startMid: Point;
  readonly moved: boolean;
}

interface Geometry {
  readonly viewport: Size;
  readonly fitted: Size;
  readonly centre: Point;
}

/** Viewport size and centre, and the fitted image size. */
function measure(surface: HTMLElement | null, image: HTMLImageElement | null): Geometry {
  const rect = surface?.getBoundingClientRect();
  const viewport = { width: rect?.width ?? 0, height: rect?.height ?? 0 };
  const natural = { width: image?.naturalWidth ?? 0, height: image?.naturalHeight ?? 0 };
  const centre = {
    x: (rect?.left ?? 0) + viewport.width / 2,
    y: (rect?.top ?? 0) + viewport.height / 2,
  };
  return { viewport, fitted: fitInside(natural, viewport), centre };
}

function relativeTo(geometry: Geometry, point: Point): Point {
  return { x: point.x - geometry.centre.x, y: point.y - geometry.centre.y };
}

/** A new gesture from the pointers now down, or null when none are. */
function startGesture(
  points: readonly Point[],
  transform: Transform,
  geometry: Geometry,
): Gesture | null {
  const [a, b] = points;
  if (a === undefined) {
    return null;
  }
  const mid = b === undefined ? a : { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  return {
    start: a,
    startTransform: transform,
    startDistance: b === undefined ? 0 : Math.hypot(a.x - b.x, a.y - b.y),
    startMid: relativeTo(geometry, mid),
    moved: false,
  };
}

/** What a pointer move does: pinch, pan when zoomed, or drag to swipe. */
function applyMove(
  gesture: Gesture,
  points: readonly Point[],
  geometry: Geometry,
): { readonly moved: boolean; readonly transform: Transform | null; readonly drag: Point | null } {
  const [a, b] = points;
  if (a === undefined) {
    return { moved: gesture.moved, transform: null, drag: null };
  }
  const dx = a.x - gesture.start.x;
  const dy = a.y - gesture.start.y;
  const moved = gesture.moved || Math.hypot(dx, dy) > TAP_SLOP_PX;
  const base = gesture.startTransform;
  const clamp = (next: Transform): Transform =>
    clampTransform(next, geometry.viewport, geometry.fitted);
  if (b !== undefined && gesture.startDistance > 0) {
    const ratio = Math.hypot(a.x - b.x, a.y - b.y) / gesture.startDistance;
    const zoomed = zoomAround(base, base.scale * ratio, gesture.startMid);
    return { moved, transform: clamp(zoomed), drag: null };
  }
  if (base.scale > MIN_SCALE) {
    return { moved, transform: clamp({ ...base, x: base.x + dx, y: base.y + dy }), drag: null };
  }
  return { moved, transform: null, drag: moved ? { x: dx, y: Math.max(0, dy) } : null };
}

/** Gesture state and handlers for the image surface. */
function useZoomPan(onSwipe: ImageViewerProps['onSwipe']) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef<Gesture | null>(null);
  const lastTap = useRef(0);
  const [transform, setTransform] = useState<Transform>(IDENTITY);
  const [drag, setDrag] = useState<Point | null>(null);
  const [isGesturing, setGesturing] = useState(false);
  const geometry = (): Geometry => measure(surfaceRef.current, imageRef.current);
  const restart = (): void => {
    gesture.current = startGesture([...pointers.current.values()], transform, geometry());
    setGesturing(gesture.current !== null);
  };
  const onTap = (point: Point, time: number): void => {
    if (time - lastTap.current >= DOUBLE_TAP_MS) {
      lastTap.current = time;
      return;
    }
    lastTap.current = 0;
    const geo = geometry();
    const next = toggleZoom(transform, relativeTo(geo, point));
    setTransform(clampTransform(next, geo.viewport, geo.fitted));
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    restart();
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const current = gesture.current;
    if (!pointers.current.has(event.pointerId) || current === null) {
      return;
    }
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const result = applyMove(current, [...pointers.current.values()], geometry());
    gesture.current = { ...current, moved: result.moved };
    if (result.transform !== null) {
      setTransform(result.transform);
    }
    setDrag(result.drag);
  };
  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const current = gesture.current;
    const point = pointers.current.get(event.pointerId);
    pointers.current.delete(event.pointerId);
    setDrag(null);
    restart();
    if (pointers.current.size > 0 || current === null || point === undefined) {
      return;
    }
    if (!current.moved) {
      onTap(point, event.timeStamp);
    } else if (current.startTransform.scale <= MIN_SCALE && current.startDistance === 0) {
      const isRtl = document.documentElement.dir === 'rtl';
      const outcome = swipeOutcome(point.x - current.start.x, point.y - current.start.y, isRtl);
      if (outcome !== null) {
        onSwipe(outcome);
      }
    }
  };
  const handlers = { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp };
  return { surfaceRef, imageRef, transform, drag, isGesturing, handlers };
}

export function ImageViewer({ path, label, onSwipe }: ImageViewerProps) {
  const url = useMediaUrl(path);
  const [failed, setFailed] = useState(false);
  const { surfaceRef, imageRef, transform, drag, isGesturing, handlers } = useZoomPan(onSwipe);
  const x = transform.x + (drag?.x ?? 0);
  const y = transform.y + (drag?.y ?? 0);
  if (path === null || failed) {
    return <p className="p-6 text-center text-white">{en.media.imageFailed}</p>;
  }
  return (
    <div
      ref={surfaceRef}
      data-testid="image-viewer-surface"
      className="flex h-full w-full touch-none items-center justify-center overflow-hidden select-none"
      {...handlers}
    >
      {url === null ? null : (
        <img
          ref={imageRef}
          src={url}
          alt={label}
          draggable={false}
          className={clsx(
            'h-full w-full object-contain',
            !isGesturing && 'motion-safe:transition-transform motion-safe:duration-200',
          )}
          style={{
            transform: `translate(${String(x)}px, ${String(y)}px) scale(${String(transform.scale)})`,
          }}
          onError={() => {
            setFailed(true);
          }}
        />
      )}
      <p className="sr-only">{en.media.zoomHint}</p>
    </div>
  );
}
