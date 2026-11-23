import { describe, expect, it } from 'vitest';
import {
  clampTransform,
  DOUBLE_TAP_SCALE,
  fitInside,
  IDENTITY,
  MAX_SCALE,
  swipeOutcome,
  toggleZoom,
  zoomAround,
} from './zoom-pan';

const viewport = { width: 400, height: 800 };
const fitted = { width: 400, height: 300 };

describe('image viewer zoom and pan', () => {
  it('fits an image inside the viewport', () => {
    expect(fitInside({ width: 1600, height: 1200 }, viewport)).toEqual(fitted);
    expect(fitInside({ width: 100, height: 400 }, viewport)).toEqual({ width: 200, height: 800 });
    expect(fitInside({ width: 0, height: 0 }, viewport)).toEqual(viewport);
  });

  it('zooms around the anchor so the point under the finger stays put', () => {
    const zoomed = zoomAround(IDENTITY, 2, { x: 100, y: 50 });
    expect(zoomed).toEqual({ scale: 2, x: -100, y: -50 });
    // The anchor maps to the same screen point before and after.
    const before = (100 - IDENTITY.x) / IDENTITY.scale;
    const after = (100 - zoomed.x) / zoomed.scale;
    expect(after).toBe(before);
  });

  it('clamps scale and panning to the image edges', () => {
    expect(clampTransform({ scale: 0.5, x: 30, y: 30 }, viewport, fitted)).toEqual(IDENTITY);
    expect(clampTransform({ scale: 9, x: 0, y: 0 }, viewport, fitted).scale).toBe(MAX_SCALE);
    // At 2× the image is 800×600: 200 px of horizontal slack each way, no
    // vertical slack because it is still shorter than the viewport.
    expect(clampTransform({ scale: 2, x: 500, y: 500 }, viewport, fitted)).toEqual({
      scale: 2,
      x: 200,
      y: 0,
    });
  });

  it('double tap toggles between fitted and zoomed', () => {
    const zoomed = toggleZoom(IDENTITY, { x: 0, y: 0 });
    expect(zoomed.scale).toBe(DOUBLE_TAP_SCALE);
    expect(toggleZoom(zoomed, { x: 10, y: 10 })).toEqual(IDENTITY);
  });

  it('reads swipes: page sideways, close downwards, ignore small drags', () => {
    expect(swipeOutcome(-80, 10, false)).toBe('next');
    expect(swipeOutcome(80, 10, false)).toBe('previous');
    expect(swipeOutcome(80, 10, true)).toBe('next');
    expect(swipeOutcome(-30, 5, false)).toBeNull();
    expect(swipeOutcome(10, 150, false)).toBe('close');
    expect(swipeOutcome(10, -150, false)).toBeNull();
    expect(swipeOutcome(0, 40, false)).toBeNull();
  });
});
