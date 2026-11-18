/**
 * `ts_local` parsing (storage side): the canonical `YYYY-MM-DDTHH:MM:SS`
 * wall-clock string becomes a {@link LocalDateTime}. Validation happens in
 * the Valibot schema; this function assumes the format matched.
 */
import type { LocalDateTime } from '../../core/model';

/** Parses the canonical wall-clock string into components. */
export function parseLocalDateTime(raw: string): LocalDateTime {
  const year = Number(raw.slice(0, 4));
  const month = Number(raw.slice(5, 7));
  const day = Number(raw.slice(8, 10));
  const hour = Number(raw.slice(11, 13));
  const minute = Number(raw.slice(14, 16));
  const second = Number(raw.slice(17, 19));
  return { year, month, day, hour, minute, second };
}

/** Renders a {@link LocalDateTime} back to the canonical string. */
export function formatLocalDateTime(date: LocalDateTime): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return (
    `${String(date.year).padStart(4, '0')}-${pad(date.month)}-${pad(date.day)}` +
    `T${pad(date.hour)}:${pad(date.minute)}:${pad(date.second)}`
  );
}
