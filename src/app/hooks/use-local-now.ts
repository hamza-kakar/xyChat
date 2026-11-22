/**
 * The device's wall-clock "now" as a LocalDateTime, read once per mount.
 * Relative labels (today, yesterday, weekday) compare chat timestamps to
 * it field by field, with no timezone math.
 */
import { useState } from 'react';
import type { LocalDateTime } from '../../core/model';

/** Reads the device clock's local fields. */
export function localNow(date: Date = new Date()): LocalDateTime {
  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
    hour: date.getHours(),
    minute: date.getMinutes(),
    second: date.getSeconds(),
  };
}

export function useLocalNow(): LocalDateTime {
  const [now] = useState(() => localNow());
  return now;
}
