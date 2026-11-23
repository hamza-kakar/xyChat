/**
 * Theme preference: System, Light or Dark. It is
 * the one value kept in localStorage, because it must apply before the
 * database loads (no flash of the wrong theme). The stored value is
 * validated on read; the choice sets `data-theme` on the root,
 * which the tokens in `tokens.css` follow.
 */
import { useCallback, useSyncExternalStore } from 'react';
import * as v from 'valibot';

export const THEME_PREFERENCES = ['system', 'light', 'dark'] as const;
/** The theme the user picked in Settings. */
export type ThemePreference = (typeof THEME_PREFERENCES)[number];

const STORAGE_KEY = 'theme';
const ThemeSchema = v.picklist(THEME_PREFERENCES);
const listeners = new Set<() => void>();

/** Reads the stored preference; 'system' when unset, invalid or blocked. */
export function readThemePreference(): ThemePreference {
  try {
    const result = v.safeParse(ThemeSchema, window.localStorage.getItem(STORAGE_KEY));
    return result.success ? result.output : 'system';
  } catch {
    return 'system';
  }
}

/** Applies a preference to the document root. */
export function applyThemePreference(preference: ThemePreference): void {
  const root = document.documentElement;
  if (preference === 'system') {
    delete root.dataset['theme'];
  } else {
    root.dataset['theme'] = preference;
  }
}

/** Stores and applies a preference. Storage failures (private mode) still
 * apply the theme for this session. */
export function saveThemePreference(preference: ThemePreference): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, preference);
  } catch {
    // Not persisted; the choice still applies until the app closes.
  }
  applyThemePreference(preference);
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Reads the current choice: the root attribute is the source of truth
 * once the app has applied the stored value at boot. */
function snapshot(): ThemePreference {
  const current = document.documentElement.dataset['theme'];
  return current === 'light' || current === 'dark' ? current : 'system';
}

/** The current preference and its setter (Settings → Appearance). */
export function useThemePreference(): readonly [ThemePreference, (next: ThemePreference) => void] {
  const preference = useSyncExternalStore(subscribe, snapshot, snapshot);
  const setPreference = useCallback((next: ThemePreference) => {
    saveThemePreference(next);
  }, []);
  return [preference, setPreference] as const;
}
