import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyThemePreference,
  readThemePreference,
  saveThemePreference,
  useThemePreference,
} from './use-theme-preference';

afterEach(() => {
  vi.restoreAllMocks();
  saveThemePreference('system');
  applyThemePreference('system');
});

describe('theme preference', () => {
  it('defaults to system and ignores an invalid stored value', () => {
    expect(readThemePreference()).toBe('system');
    vi.spyOn(Storage.prototype, 'getItem').mockReturnValue('neon');
    expect(readThemePreference()).toBe('system');
  });

  it('stores the choice and sets the root attribute', () => {
    saveThemePreference('dark');
    expect(readThemePreference()).toBe('dark');
    expect(document.documentElement.dataset['theme']).toBe('dark');
    saveThemePreference('system');
    expect(document.documentElement.dataset['theme']).toBeUndefined();
  });

  it('still applies the theme when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    saveThemePreference('light');
    expect(document.documentElement.dataset['theme']).toBe('light');
  });

  it('re-renders subscribers when the choice changes', () => {
    const { result } = renderHook(() => useThemePreference());
    expect(result.current[0]).toBe('system');
    act(() => {
      result.current[1]('light');
    });
    expect(result.current[0]).toBe('light');
  });
});
