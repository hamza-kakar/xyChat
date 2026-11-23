import { describe, expect, it } from 'vitest';
import { buildGalleryRows, columnsForWidth } from './gallery-rows';

const at = (year: number, month: number) => ({
  year,
  month,
  day: 1,
  hour: 0,
  minute: 0,
  second: 0,
});

describe('gallery rows', () => {
  it('groups by month and splits rows by column count', () => {
    const items = [
      { id: 'a', ts: at(2026, 5) },
      { id: 'b', ts: at(2026, 5) },
      { id: 'c', ts: at(2026, 5) },
      { id: 'd', ts: at(2026, 5) },
      { id: 'e', ts: at(2026, 4) },
      { id: 'f', ts: at(2025, 4) },
    ];
    const rows = buildGalleryRows(items, 3, (item) => item.ts);
    expect(
      rows.map((row) =>
        row.kind === 'month'
          ? `${String(row.year)}-${String(row.month)}`
          : `${String(row.firstIndex)}:${row.items.map((item) => item.id).join('')}`,
      ),
    ).toEqual(['2026-5', '0:abc', '3:d', '2026-4', '4:e', '2025-4', '5:f']);
    expect(new Set(rows.map((row) => row.key)).size).toBe(rows.length);
  });

  it('handles empty input and odd column counts', () => {
    expect(buildGalleryRows([], 3, () => at(2026, 1))).toEqual([]);
    const rows = buildGalleryRows([1, 2], 0, () => at(2026, 1));
    expect(rows.filter((row) => row.kind === 'items')).toHaveLength(2);
  });

  it('uses 3 columns on phones and 5+ on wide screens', () => {
    expect(columnsForWidth(375)).toBe(3);
    expect(columnsForWidth(700)).toBe(5);
    expect(columnsForWidth(1400)).toBe(10);
  });
});
