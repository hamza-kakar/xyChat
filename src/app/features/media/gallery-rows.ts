/**
 * Gallery layout (AGENTS.md §12.6): items grouped under month headers and
 * cut into rows of N columns for the virtualized grid. Pure, so the
 * grouping is unit-tested without a DOM.
 */
import type { LocalDateTime } from '../../../core/model';

/** One virtualized gallery row. */
export type GalleryRow<T> =
  | {
      readonly kind: 'month';
      readonly key: string;
      readonly year: number;
      readonly month: number;
    }
  | {
      readonly kind: 'items';
      readonly key: string;
      /** Index of the row's first item in the flat list (viewer order). */
      readonly firstIndex: number;
      readonly items: readonly T[];
    };

/**
 * Groups items (newest first) by calendar month and splits each month into
 * rows of `columns` items.
 *
 * @param items Items in display order.
 * @param columns Items per row (1 for list tabs).
 * @param dateOf The item's wall-clock time.
 * @returns Month headers and item rows in display order.
 */
export function buildGalleryRows<T>(
  items: readonly T[],
  columns: number,
  dateOf: (item: T) => LocalDateTime,
): readonly GalleryRow<T>[] {
  const rows: GalleryRow<T>[] = [];
  const perRow = Math.max(1, Math.floor(columns));
  let current: { year: number; month: number; items: T[]; firstIndex: number } | null = null;
  const flush = (): void => {
    if (current === null) {
      return;
    }
    const { year, month } = current;
    rows.push({ kind: 'month', key: `m-${String(year)}-${String(month)}`, year, month });
    for (let start = 0; start < current.items.length; start += perRow) {
      const firstIndex = current.firstIndex + start;
      rows.push({
        kind: 'items',
        key: `i-${String(firstIndex)}`,
        firstIndex,
        items: current.items.slice(start, start + perRow),
      });
    }
  };
  items.forEach((item, index) => {
    const { year, month } = dateOf(item);
    if (current?.year !== year || current.month !== month) {
      flush();
      current = { year, month, items: [], firstIndex: index };
    }
    current.items.push(item);
  });
  flush();
  return rows;
}

/** Grid columns for a container width (§12.6: 3 on phones, 5+ wide). */
export function columnsForWidth(width: number): number {
  const PHONE_COLUMNS = 3;
  const WIDE_COLUMNS = 5;
  const WIDE_FROM_PX = 600;
  const MIN_TILE_PX = 140;
  if (width < WIDE_FROM_PX) {
    return PHONE_COLUMNS;
  }
  return Math.max(WIDE_COLUMNS, Math.floor(width / MIN_TILE_PX));
}
