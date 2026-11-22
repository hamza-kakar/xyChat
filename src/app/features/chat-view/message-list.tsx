/**
 * The virtualized message log (AGENTS.md §12.5, §16, §17). Every seq is a
 * row, so the list length is the chat's message count and loading older
 * blocks never shifts what is on screen. Blocks of 300 load for the
 * visible range plus a margin; rows whose block is pending show a
 * placeholder. The first paint lands on the restored position, or on the
 * last message.
 */
import { useLayoutEffect, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { formatDaySeparator } from '../../../core/dates';
import { en } from '../../i18n/en';
import { formatString } from '../../i18n/format-string';
import { useLocalNow } from '../../hooks/use-local-now';
import { blocksForRange, useMessageBlocks } from '../../queries/message-queries';
import type { ChatId } from '../../../core/ids';
import type { WindowMessage } from '../../../client/db-client';
import { MessageRow, PendingRow } from './message-row';
import type { RowContext } from './row-model';

/** First-guess row height before measuring (px). */
const ESTIMATED_ROW_PX = 72;
/** Rows rendered beyond the viewport on each side (§12.5: ~10). */
const OVERSCAN_ROWS = 10;
/** Rows of data loaded beyond the rendered range, so neighbors (day
 * separators, run grouping) are known before they scroll in. */
const PREFETCH_ROWS = 100;

/** Props for {@link MessageList}. */
export interface MessageListProps {
  readonly chatId: ChatId;
  readonly title: string;
  readonly total: number;
  readonly context: RowContext;
  readonly colors: ReadonlyMap<string, number>;
  /** Seq to show at the top on first paint; null opens at the last message. */
  readonly initialTopSeq: number | null;
  readonly onTopSeqChange: (seq: number) => void;
  readonly onOpenActions: (message: WindowMessage) => void;
}

export function MessageList(props: MessageListProps) {
  const { chatId, total, initialTopSeq, onTopSeqChange } = props;
  const scrollRef = useRef<HTMLDivElement>(null);
  const now = useLocalNow();
  const target = Math.min(initialTopSeq ?? total - 1, total - 1);
  const positioned = useRef(false);

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Virtual returns a mutable instance by design; this component is meant to re-render with it, not be memoized.
  const virtualizer = useVirtualizer({
    count: total,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ESTIMATED_ROW_PX,
    overscan: OVERSCAN_ROWS,
    initialOffset: () => Math.max(0, target * ESTIMATED_ROW_PX),
    onChange: (instance) => {
      const top = instance.range?.startIndex;
      if (positioned.current && top !== undefined) {
        onTopSeqChange(top);
      }
    },
  });

  const items = virtualizer.getVirtualItems();
  const firstRendered = positioned.current ? (items[0]?.index ?? target) : target;
  const lastRendered = positioned.current ? (items.at(-1)?.index ?? target) : target;
  const blocks = useMessageBlocks(
    chatId,
    blocksForRange(firstRendered - PREFETCH_ROWS, lastRendered + PREFETCH_ROWS),
  );
  const targetLoaded = blocks.bySeq.has(target);

  useLayoutEffect(() => {
    if (!positioned.current && targetLoaded) {
      positioned.current = true;
      virtualizer.scrollToIndex(target, { align: initialTopSeq === null ? 'end' : 'start' });
      // Record the landing spot too, so leaving without scrolling keeps it.
      onTopSeqChange(virtualizer.range?.startIndex ?? target);
    }
  }, [targetLoaded, target, initialTopSeq, virtualizer, onTopSeqChange]);

  const topSeq = virtualizer.range?.startIndex;
  const topMessage = topSeq === undefined ? undefined : blocks.bySeq.get(topSeq);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {blocks.isError ? (
        <p role="alert" className="bg-surface-raised text-text px-4 py-2 text-sm">
          {en.chatView.loadFailed}
        </p>
      ) : null}
      {topMessage === undefined ? null : (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-2 z-10 flex justify-center"
        >
          <span className="bg-surface-raised/95 text-text-muted rounded-full px-3 py-1 text-xs font-medium shadow">
            {formatDaySeparator(topMessage.tsLocal, now, {
              locale: props.context.locale,
              labels: { today: en.chatView.today, yesterday: en.chatView.yesterday },
            })}
          </span>
        </div>
      )}
      <div
        ref={scrollRef}
        role="log"
        aria-live="off"
        aria-label={formatString(en.chatView.logLabel, { title: props.title })}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-2"
      >
        <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
          <div
            className="absolute top-0 w-full"
            style={{
              insetInlineStart: 0,
              transform: `translateY(${String(items[0]?.start ?? 0)}px)`,
            }}
          >
            {items.map((item) => {
              const message = blocks.bySeq.get(item.index);
              return (
                <div key={item.key} data-index={item.index} ref={virtualizer.measureElement}>
                  {message === undefined ? (
                    <PendingRow seq={item.index} total={total} />
                  ) : (
                    <MessageRow
                      message={message}
                      prev={blocks.bySeq.get(item.index - 1)}
                      context={props.context}
                      now={now}
                      total={total}
                      colors={props.colors}
                      onOpenActions={props.onOpenActions}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
