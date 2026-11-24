/**
 * The virtualized message log. Every seq is a
 * row, so the list length is the chat's message count and loading older
 * blocks never shifts what is on screen. Blocks of 300 load for the
 * visible range plus a margin; rows whose block is pending show a
 * placeholder. The first paint lands on the restored position, or on the
 * last message.
 */
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { formatDaySeparator } from '../../../core/dates';
import { en } from '../../i18n/en';
import { formatString } from '../../i18n/format-string';
import { useLocalNow } from '../../hooks/use-local-now';
import { blocksForRange, useMessageBlocks } from '../../queries/message-queries';
import type { ChatId } from '../../../core/ids';
import type { WindowMessage } from '../../../client/db-client';
import { ChevronDownIcon } from '../../components/icons';
import { MessageRow, PendingRow } from './message-row';
import type { RowContext } from './row-model';

/** First-guess row height before measuring (px). */
const ESTIMATED_ROW_PX = 72;
/** Rows rendered beyond the viewport on each side (~10). */
const OVERSCAN_ROWS = 10;
/** Rows of data loaded beyond the rendered range, so neighbors (day
 * separators, run grouping) are known before they scroll in. */
const PREFETCH_ROWS = 100;

/** How long the floating day pill stays after scrolling stops (ms). */
const DAY_PILL_LINGER_MS = 1500;

/** A request to scroll a message into the middle of the view. */
export interface JumpRequest {
  readonly seq: number;
  readonly token: number;
}

/** Largest count shown on the jump-to-latest badge. */
const MAX_BADGE_COUNT = 999;

/** Props for {@link MessageList}. */
export interface MessageListProps {
  readonly chatId: ChatId;
  readonly title: string;
  readonly total: number;
  readonly context: RowContext;
  readonly colors: ReadonlyMap<string, number>;
  /** Seq to show on first paint; null opens at the last message. */
  readonly initialTopSeq: number | null;
  /** How the first-paint seq is placed: at the top when restoring a place,
   * centered when opening at a linked message. */
  readonly initialAlign: 'start' | 'center';
  /** A requested jump; a new token scrolls again even to the same seq. */
  readonly jump: JumpRequest | null;
  /** Seq shown highlighted (jumped-to message), or null. */
  readonly highlightSeq: number | null;
  /** Row ids of bookmarked messages. */
  readonly bookmarked: ReadonlySet<number>;
  readonly onTopSeqChange: (seq: number) => void;
  readonly onOpenActions: (message: WindowMessage) => void;
}

export function MessageList(props: MessageListProps) {
  const { chatId, total, initialTopSeq, onTopSeqChange, jump } = props;
  const scrollRef = useRef<HTMLDivElement>(null);
  const handledJump = useRef<number | null>(null);
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
    mergeBlocks(
      blocksForRange(firstRendered - PREFETCH_ROWS, lastRendered + PREFETCH_ROWS),
      jump === null ? [] : blocksForRange(jump.seq - PREFETCH_ROWS, jump.seq + PREFETCH_ROWS),
    ),
  );
  const targetLoaded = blocks.bySeq.has(target);
  const jumpLoaded = jump !== null && blocks.bySeq.has(jump.seq);
  const initialAlign = initialTopSeq === null ? 'end' : props.initialAlign;

  useLayoutEffect(() => {
    if (!positioned.current && targetLoaded) {
      positioned.current = true;
      virtualizer.scrollToIndex(target, { align: initialAlign });
      // Record the landing spot too, so leaving without scrolling keeps it.
      onTopSeqChange(virtualizer.range?.startIndex ?? target);
    }
  }, [targetLoaded, target, initialAlign, virtualizer, onTopSeqChange]);

  // Runs after the landing effect above, also in the commit that lands the
  // list: a jump requested before the first landing waits for it. After
  // that, only the jump's own block matters; the opening seq's block may
  // long since have scrolled out and been dropped.
  useLayoutEffect(() => {
    if (jump !== null && jumpLoaded && positioned.current && handledJump.current !== jump.token) {
      handledJump.current = jump.token;
      virtualizer.scrollToIndex(jump.seq, { align: 'center' });
    }
  }, [jump, jumpLoaded, virtualizer]);

  const isScrolling = useRecentScroll(scrollRef);
  const topSeq = virtualizer.range?.startIndex;
  const endSeq = virtualizer.range?.endIndex;
  const below = positioned.current && endSeq !== undefined ? total - 1 - endSeq : 0;
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
          className={`pointer-events-none absolute inset-x-0 top-2 z-10 flex justify-center ${isScrolling ? 'visible opacity-100' : 'invisible opacity-0 transition-[opacity,visibility] duration-300'}`}
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
                      isHighlighted={props.highlightSeq === item.index}
                      isBookmarked={props.bookmarked.has(message.rowId)}
                      onOpenActions={props.onOpenActions}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      {below > 0 ? (
        <JumpToLatest
          count={below}
          onClick={() => {
            virtualizer.scrollToIndex(total - 1, { align: 'end' });
          }}
        />
      ) : null}
    </div>
  );
}

/** True while the user scrolls the element and for a moment after. The
 * floating day pill uses it so it does not sit over the top message once
 * the list is still. */
function useRecentScroll(ref: RefObject<HTMLElement | null>): boolean {
  const [isScrolling, setScrolling] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (element === null) {
      return undefined;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    // The landing scroll on open is not the user's: wait for a first
    // touch, wheel, pointer or key on the list.
    let hasUserInput = false;
    const onInput = (): void => {
      hasUserInput = true;
    };
    const inputEvents = ['touchstart', 'wheel', 'pointerdown', 'keydown'] as const;
    for (const type of inputEvents) {
      element.addEventListener(type, onInput, { passive: true });
    }
    const onScroll = (): void => {
      if (!hasUserInput) {
        return;
      }
      setScrolling(true);
      clearTimeout(timer);
      timer = setTimeout(() => {
        setScrolling(false);
      }, DAY_PILL_LINGER_MS);
    };
    element.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      element.removeEventListener('scroll', onScroll);
      for (const type of inputEvents) {
        element.removeEventListener(type, onInput);
      }
      clearTimeout(timer);
    };
  }, [ref]);
  return isScrolling;
}

/** Union of two block lists, keeping order and dropping repeats. */
function mergeBlocks(a: readonly number[], b: readonly number[]): readonly number[] {
  return b.every((block) => a.includes(block)) ? a : [...new Set([...a, ...b])];
}

/** Floating "jump to the latest message" button with the count below the
 * viewport. */
function JumpToLatest({
  count,
  onClick,
}: {
  readonly count: number;
  readonly onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={formatString(en.chatView.jumpToLatestCount, { count })}
      className="bg-surface-raised text-accent absolute end-3 bottom-3 z-10 flex min-h-11 min-w-11 items-center justify-center rounded-full shadow-md"
      onClick={onClick}
    >
      <ChevronDownIcon className="h-6 w-6" />
      <span
        aria-hidden="true"
        className="bg-accent text-accent-contrast absolute end-0 -top-2 min-w-5 rounded-full px-1 text-center text-xs leading-5 font-semibold"
      >
        {count > MAX_BADGE_COUNT ? `${String(MAX_BADGE_COUNT)}+` : count}
      </span>
    </button>
  );
}
