import { describe, expect, it } from 'vitest';
import { isInactiveTooLong, locksOnHide, secondsUntil } from './auto-lock';

describe('auto-lock rules (§15.3)', () => {
  it('locks on hide only with a PIN and the immediate setting', () => {
    expect(locksOnHide(true, 0)).toBe(true);
    expect(locksOnHide(true, 5)).toBe(false);
    expect(locksOnHide(false, 0)).toBe(false);
  });

  it('locks after the inactivity delay', () => {
    const base = { hasPin: true, autoLockMinutes: 5, lastActivity: 0 };
    expect(isInactiveTooLong({ ...base, now: 299_999 })).toBe(false);
    expect(isInactiveTooLong({ ...base, now: 300_000 })).toBe(true);
    expect(isInactiveTooLong({ ...base, hasPin: false, now: 1e9 })).toBe(false);
    expect(isInactiveTooLong({ ...base, autoLockMinutes: 0, now: 1e9 })).toBe(false);
  });

  it('rounds the remaining lockout up to whole seconds', () => {
    expect(secondsUntil(30_000, 0)).toBe(30);
    expect(secondsUntil(30_000, 29_001)).toBe(1);
    expect(secondsUntil(30_000, 31_000)).toBe(0);
  });
});
