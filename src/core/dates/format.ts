/**
 * Timestamp display formatting (AGENTS.md §12.1): export timestamps are
 * wall-clock values with NO timezone — they render by building a Date from
 * the UTC fields and formatting with `timeZone: 'UTC'`, so the displayed
 * time equals the stored local time in every process timezone (§25: never
 * convert chat timestamps to UTC for display).
 */
import type { LocalDateTime } from '../model';

/** Formats a local date-time for previews and lists (e.g. "Nov 17, 21:19").
 *
 * @param dateTime Wall-clock fields exactly as written in the export.
 * @param locale BCP-47 tag (navigator.language on the main thread).
 */
export function formatTimestamp(dateTime: LocalDateTime, locale: string): string {
  const asUtc = Date.UTC(
    dateTime.year,
    dateTime.month - 1,
    dateTime.day,
    dateTime.hour,
    dateTime.minute,
    dateTime.second,
  );
  return new Intl.DateTimeFormat(locale, {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(asUtc));
}
