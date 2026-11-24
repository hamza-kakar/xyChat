/**
 * Keeps the page itself from scrolling or rubber-banding while a screen
 * that scrolls its own inner list is shown. On iOS home-screen apps a
 * draggable page slides the header into the status-bar fade, which blurs
 * the title.
 */
import { useEffect } from 'react';

const LOCK_CLASS = 'page-scroll-locked';

export function useLockPageScroll(): void {
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add(LOCK_CLASS);
    return () => {
      root.classList.remove(LOCK_CLASS);
    };
  }, []);
}
