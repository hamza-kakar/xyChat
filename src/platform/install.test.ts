import { afterEach, describe, expect, it, vi } from 'vitest';
import { isIosSafari, isStandalone } from './install';

const originalMatchMedia = window.matchMedia.bind(window);

afterEach(() => {
  window.matchMedia = originalMatchMedia;
  delete (navigator as { standalone?: boolean }).standalone;
});

describe('isStandalone', () => {
  it('is false in a regular browser tab', () => {
    expect(isStandalone()).toBe(false);
  });

  it('is true when display-mode is standalone', () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true });
    expect(isStandalone()).toBe(true);
  });

  it('is true when iOS reports navigator.standalone', () => {
    Object.defineProperty(navigator, 'standalone', {
      value: true,
      configurable: true,
    });
    expect(isStandalone()).toBe(true);
  });
});

describe('isIosSafari', () => {
  it('is true for an iPhone user agent', () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari',
    );
    expect(isIosSafari()).toBe(true);
    vi.restoreAllMocks();
  });

  it('is true for a touch-capable iPad masquerading as macOS', () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
    );
    vi.spyOn(navigator, 'maxTouchPoints', 'get').mockReturnValue(5);
    expect(isIosSafari()).toBe(true);
    vi.restoreAllMocks();
  });

  it('is false for a desktop Chrome user agent', () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (X11; Linux x86_64) Chrome/120.0',
    );
    expect(isIosSafari()).toBe(false);
    vi.restoreAllMocks();
  });
});
