/**
 * Export-source characteristics detected from an export file.
 */

/** Which operating system produced the export. */
export type SourcePlatform = 'ios' | 'android' | 'unknown';

/** Calendar order of the day/month/year fields in header timestamps. */
export type DateOrder = 'DMY' | 'MDY' | 'YMD';

/** Whether header times use a 12-hour clock with meridiem or 24-hour. */
export type ClockFormat = '12h' | '24h';

/**
 * Wall-clock time exactly as written in the export. NO timezone offset is
 * stored and none is ever applied: a message exported as "17/11/2026, 21:19"
 * is displayed as 21:19 everywhere, forever.
 */
export interface LocalDateTime {
  readonly year: number; // 4-digit (2-digit years become 2000 + yy)
  readonly month: number; // 1–12
  readonly day: number; // 1–31
  readonly hour: number; // 0–23
  readonly minute: number; // 0–59
  readonly second: number; // 0–59 (0 when the export has no seconds)
}
