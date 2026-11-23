/**
 * Long-press and context-menu handling: touch
 * users hold, mouse users right-click, keyboard users use the explicit
 * button the caller also renders. A completed long press swallows the
 * click that follows it, so a link under the finger doesn't navigate.
 */
import { useCallback, useEffect, useRef, type MouseEvent, type PointerEvent } from 'react';

/** Hold time before a press counts as long (ms). */
export const LONG_PRESS_MS = 500;
/** Finger travel that cancels a long press (px), so scrolling never fires it. */
const MOVE_TOLERANCE_PX = 10;

/** Handlers to spread onto the pressable element. */
export interface LongPressHandlers {
  readonly onPointerDown: (event: PointerEvent) => void;
  readonly onPointerMove: (event: PointerEvent) => void;
  readonly onPointerUp: () => void;
  readonly onPointerCancel: () => void;
  readonly onPointerLeave: () => void;
  readonly onContextMenu: (event: MouseEvent) => void;
  readonly onClickCapture: (event: MouseEvent) => void;
}

export function useLongPress(onLongPress: () => void): LongPressHandlers {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const origin = useRef<{ readonly x: number; readonly y: number } | null>(null);
  const fired = useRef(false);

  const cancel = useCallback((): void => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    origin.current = null;
  }, []);

  useEffect(() => cancel, [cancel]);

  return {
    onPointerDown: (event) => {
      if (event.pointerType === 'mouse') {
        return;
      }
      fired.current = false;
      origin.current = { x: event.clientX, y: event.clientY };
      timer.current = setTimeout(() => {
        fired.current = true;
        timer.current = null;
        onLongPress();
      }, LONG_PRESS_MS);
    },
    onPointerMove: (event) => {
      const start = origin.current;
      if (start === null) {
        return;
      }
      const moved = Math.hypot(event.clientX - start.x, event.clientY - start.y);
      if (moved > MOVE_TOLERANCE_PX) {
        cancel();
      }
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
    onPointerLeave: cancel,
    onContextMenu: (event) => {
      event.preventDefault();
      if (!fired.current) {
        cancel();
        onLongPress();
      }
    },
    onClickCapture: (event) => {
      if (fired.current) {
        fired.current = false;
        event.preventDefault();
        event.stopPropagation();
      }
    },
  };
}
