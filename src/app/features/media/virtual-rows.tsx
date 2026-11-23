/**
 * A virtualized, measured column of rows inside its own scroll container
 * (the gallery is virtualized). Asks for the next page
 * when the last rows come into view.
 */
import { useEffect, useRef, type ReactNode } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

/** Rows rendered beyond the viewport on each side. */
const OVERSCAN_ROWS = 6;
/** Rows from the end that trigger the next page. */
const LOAD_AHEAD_ROWS = 4;

/** Props for {@link VirtualRows}. */
export interface VirtualRowsProps {
  readonly count: number;
  readonly rowKey: (index: number) => string;
  readonly estimateSize: (index: number) => number;
  readonly renderRow: (index: number) => ReactNode;
  readonly hasMore: boolean;
  readonly isLoadingMore: boolean;
  readonly onLoadMore: () => void;
  readonly footer: ReactNode;
  readonly label: string;
}

export function VirtualRows(props: VirtualRowsProps) {
  const { count, hasMore, isLoadingMore, onLoadMore } = props;
  const scrollRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Virtual returns a mutable instance by design; this component is meant to re-render with it, not be memoized.
  const virtualizer = useVirtualizer({
    count,
    getScrollElement: () => scrollRef.current,
    estimateSize: props.estimateSize,
    getItemKey: props.rowKey,
    overscan: OVERSCAN_ROWS,
  });
  const items = virtualizer.getVirtualItems();
  const lastIndex = items.at(-1)?.index ?? -1;

  useEffect(() => {
    if (hasMore && !isLoadingMore && lastIndex >= count - LOAD_AHEAD_ROWS) {
      onLoadMore();
    }
  }, [hasMore, isLoadingMore, lastIndex, count, onLoadMore]);

  return (
    <div
      ref={scrollRef}
      role="region"
      aria-label={props.label}
      className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
    >
      <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
        <div
          className="absolute inset-x-0 top-0"
          style={{ transform: `translateY(${String(items[0]?.start ?? 0)}px)` }}
        >
          {items.map((item) => (
            <div key={item.key} data-index={item.index} ref={virtualizer.measureElement}>
              {props.renderRow(item.index)}
            </div>
          ))}
        </div>
      </div>
      {props.footer}
    </div>
  );
}
