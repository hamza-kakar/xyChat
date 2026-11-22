/**
 * One file tab of the gallery (AGENTS.md §12.6): pages of stored media,
 * newest first, grouped under month headers — a 3-column grid on phones
 * (5+ on wide screens) for photos and videos, a list for audio and
 * documents — and the full-screen viewer over them.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChatId } from '../../../core/ids';
import { formatMonthYear } from '../../../core/dates';
import { en } from '../../i18n/en';
import { useGallery } from '../../queries/media-queries';
import type { GalleryItemView } from '../../../client/db-client';
import { buildGalleryRows, columnsForWidth, type GalleryRow } from './gallery-rows';
import { GalleryListRow, GalleryTile } from './gallery-tiles';
import { itemDate } from './media-format';
import { TAB_TYPES, isGridTab, type FileTab } from './media-tabs';
import { MediaViewer } from './media-viewer';
import { VirtualRows } from './virtual-rows';

const MONTH_ROW_PX = 40;
const LIST_ROW_PX = 57;
const FALLBACK_WIDTH_PX = 390;

/** The width of an element, kept current as it resizes. */
function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(FALLBACK_WIDTH_PX);
  useEffect(() => {
    const element = ref.current;
    if (element === null) {
      return undefined;
    }
    setWidth(element.clientWidth);
    const observer = new ResizeObserver(() => {
      setWidth(element.clientWidth);
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, []);
  return { ref, width };
}

/** Props for {@link GalleryTab}. */
export interface GalleryTabProps {
  readonly chatId: ChatId;
  readonly tab: FileTab;
}

export function GalleryTab({ chatId, tab }: GalleryTabProps) {
  const gallery = useGallery(chatId, TAB_TYPES[tab], true);
  const { ref, width } = useWidth();
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const isGrid = isGridTab(tab);
  const columns = isGrid ? columnsForWidth(width) : 1;
  const items = useMemo(
    () => gallery.data?.pages.flatMap((page) => page.items) ?? [],
    [gallery.data],
  );
  const rows = useMemo(() => buildGalleryRows(items, columns, itemDate), [items, columns]);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = gallery;
  const loadMore = useCallback(() => {
    void fetchNextPage();
  }, [fetchNextPage]);
  const open = useCallback((index: number) => {
    setOpenIndex(index);
  }, []);
  // Paging through the viewer near the end loads the next page, so "Next"
  // keeps going past what the grid has shown.
  useEffect(() => {
    if (openIndex !== null && openIndex >= items.length - 2 && hasNextPage && !isFetchingNextPage) {
      void fetchNextPage();
    }
  }, [openIndex, items.length, hasNextPage, isFetchingNextPage, fetchNextPage]);

  let body;
  if (gallery.isPending) {
    body = <p className="text-text-muted p-6">{en.media.loading}</p>;
  } else if (gallery.isError) {
    body = (
      <p role="alert" className="text-text-muted p-6">
        {en.media.failed}
      </p>
    );
  } else if (items.length === 0) {
    body = <p className="text-text-muted p-6 text-center">{en.media.empty[tab]}</p>;
  } else {
    const tileSize = width / columns;
    body = (
      <VirtualRows
        label={en.media.tabs[tab]}
        count={rows.length}
        rowKey={(index) => rows[index]?.key ?? String(index)}
        estimateSize={(index) => {
          const row = rows[index];
          if (row?.kind === 'month') {
            return MONTH_ROW_PX;
          }
          return isGrid ? tileSize : LIST_ROW_PX;
        }}
        renderRow={(index) => (
          <GalleryRowView row={rows[index]} isGrid={isGrid} columns={columns} onOpen={open} />
        )}
        hasMore={hasNextPage}
        isLoadingMore={isFetchingNextPage}
        onLoadMore={loadMore}
        footer={
          isFetchingNextPage ? (
            <p className="text-text-muted p-4 text-center text-sm">{en.media.loadingMore}</p>
          ) : null
        }
      />
    );
  }
  return (
    <div ref={ref} className="flex min-h-0 flex-1 flex-col">
      {body}
      {openIndex === null ? null : (
        <MediaViewer
          chatId={chatId}
          items={items}
          index={openIndex}
          onIndexChange={setOpenIndex}
          onClose={() => {
            setOpenIndex(null);
          }}
          showInChat
        />
      )}
    </div>
  );
}

function GalleryRowView({
  row,
  isGrid,
  columns,
  onOpen,
}: {
  readonly row: GalleryRow<GalleryItemView> | undefined;
  readonly isGrid: boolean;
  readonly columns: number;
  readonly onOpen: (index: number) => void;
}) {
  if (row === undefined) {
    return null;
  }
  if (row.kind === 'month') {
    return (
      <h2 className="bg-surface text-text-muted px-4 pt-4 pb-2 text-sm font-semibold">
        {formatMonthYear({ year: row.year, month: row.month }, navigator.language)}
      </h2>
    );
  }
  if (!isGrid) {
    return (
      <>
        {row.items.map((item, offset) => (
          <GalleryListRow
            key={item.attachment.id}
            item={item}
            index={row.firstIndex + offset}
            onOpen={onOpen}
          />
        ))}
      </>
    );
  }
  return (
    <div
      className="grid gap-0.5 pb-0.5"
      style={{ gridTemplateColumns: `repeat(${String(columns)}, minmax(0, 1fr))` }}
    >
      {row.items.map((item, offset) => (
        <GalleryTile
          key={item.attachment.id}
          item={item}
          index={row.firstIndex + offset}
          onOpen={onOpen}
        />
      ))}
    </div>
  );
}
