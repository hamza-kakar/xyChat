/**
 * Wall-clock-as-UTC seconds (ts_key): ordering and range
 * filters only — never for display.
 */

/** Converts wall-clock components to ordering seconds. */
export function tsLocalToKey(t: {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
}): number {
  return Date.UTC(t.year, t.month - 1, t.day, t.hour, t.minute, t.second) / 1000;
}
