/**
 * Debounced copy of a fast-changing value (search fields): the value
 * settles `delayMs` after the last change, so typing does not fire a
 * query per keystroke.
 */
import { useEffect, useState } from 'react';

export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => {
      setSettled(value);
    }, delayMs);
    return () => {
      clearTimeout(timer);
    };
  }, [value, delayMs]);
  return settled;
}
