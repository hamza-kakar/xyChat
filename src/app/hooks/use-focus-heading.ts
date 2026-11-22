/**
 * Route-change focus (AGENTS.md §16): moves focus to the page heading when
 * a screen mounts, so screen readers announce the new page.
 */
import { useEffect, useRef } from 'react';

export function useFocusHeading<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, []);
  return ref;
}
