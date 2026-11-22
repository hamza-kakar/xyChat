/**
 * When the app locks by itself (AGENTS.md §15.3): with a PIN set,
 * "Immediately" locks whenever the app is hidden; a delay in minutes locks
 * after that long without interaction, counting time spent hidden.
 */

const MS_PER_MINUTE = 60_000;

/** Inputs of the auto-lock rule. */
export interface AutoLockInput {
  readonly hasPin: boolean;
  /** 0 = immediately on hide; otherwise minutes of inactivity. */
  readonly autoLockMinutes: number;
  /** Epoch ms of the last interaction (or of becoming visible). */
  readonly lastActivity: number;
  readonly now: number;
}

/** True when the inactivity delay has run out. */
export function isInactiveTooLong(input: AutoLockInput): boolean {
  if (!input.hasPin || input.autoLockMinutes === 0) {
    return false;
  }
  return input.now - input.lastActivity >= input.autoLockMinutes * MS_PER_MINUTE;
}

/** True when hiding the app should lock it at once. */
export function locksOnHide(hasPin: boolean, autoLockMinutes: number): boolean {
  return hasPin && autoLockMinutes === 0;
}

/** Whole seconds left until `until`, at least 1 while it is in the future. */
export function secondsUntil(until: number, now: number): number {
  return Math.max(0, Math.ceil((until - now) / 1000));
}
