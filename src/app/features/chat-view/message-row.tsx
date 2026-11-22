/**
 * One virtualized chat row (AGENTS.md §12.5, §16): optional day separator,
 * then a bubble, a system pill or a call pill. Memoized with stable props
 * (§18.4) so scrolling re-renders only rows whose data changed.
 */
import { memo } from 'react';
import { formatDaySeparator, formatTime } from '../../../core/dates';
import type { LocalDateTime } from '../../../core/model';
import { en } from '../../i18n/en';
import { PhoneIcon } from '../../components/icons';
import { useLongPress } from '../../hooks/use-long-press';
import type { WindowMessage } from '../../../client/db-client';
import { layoutRow, messageLabel, type RowContext, type RowLayout } from './row-model';
import { MessageContent } from './message-content';
import { isBareSticker } from './media-kind';
import { RichText } from './rich-text';

/** Props for {@link MessageRow}. */
export interface MessageRowProps {
  readonly message: WindowMessage;
  readonly prev: WindowMessage | undefined;
  readonly context: RowContext;
  readonly now: LocalDateTime;
  readonly total: number;
  /** Palette index per author id (§12.2). */
  readonly colors: ReadonlyMap<string, number>;
  readonly onOpenActions: (message: WindowMessage) => void;
}

function DaySeparator({
  message,
  now,
  locale,
}: {
  readonly message: WindowMessage;
  readonly now: LocalDateTime;
  readonly locale: string;
}) {
  return (
    <div className="flex justify-center py-2">
      <span className="bg-surface-raised text-text-muted rounded-full px-3 py-1 text-xs font-medium shadow-sm">
        {formatDaySeparator(message.tsLocal, now, {
          locale,
          labels: { today: en.chatView.today, yesterday: en.chatView.yesterday },
        })}
      </span>
    </div>
  );
}

function Pill({ message, isCall }: { readonly message: WindowMessage; readonly isCall: boolean }) {
  return (
    <div className="flex justify-center px-6 py-1">
      <span className="bg-surface-raised text-text-muted flex max-w-full items-center gap-1.5 rounded-xl px-3 py-1 text-center text-sm">
        {isCall ? <PhoneIcon className="h-4 w-4 shrink-0" /> : null}
        <RichText body={message.body} />
      </span>
    </div>
  );
}

function BubbleMeta({
  message,
  locale,
}: {
  readonly message: WindowMessage;
  readonly locale: string;
}) {
  return (
    <span className="text-text-muted-on-bubble flex justify-end gap-1.5 text-[0.7rem] leading-4">
      {message.isEdited ? <span>{en.chatView.edited}</span> : null}
      <span>{formatTime(message.tsLocal, { locale })}</span>
    </span>
  );
}

function Bubble({
  message,
  layout,
  color,
  locale,
}: {
  readonly message: WindowMessage;
  readonly layout: RowLayout;
  readonly color: number | undefined;
  readonly locale: string;
}) {
  const bare = isBareSticker(message.attachments[0]);
  const tail = layout.isOutgoing ? 'rounded-se-sm' : 'rounded-ss-sm';
  const chrome = bare
    ? ''
    : `${layout.isOutgoing ? 'bg-bubble-out' : 'bg-bubble-in'} ${layout.isRunStart ? tail : ''} rounded-2xl px-3 py-1.5 shadow-sm`;
  return (
    <div
      className={`flex px-3 ${layout.isOutgoing ? 'justify-end' : 'justify-start'} ${layout.isRunStart ? 'mt-2' : 'mt-0.5'}`}
    >
      <div className={`text-text-on-bubble flex max-w-[80%] min-w-0 flex-col gap-0.5 ${chrome}`}>
        {layout.showSenderName ? (
          <span
            className="truncate text-sm font-semibold"
            dir="auto"
            style={{ color: `var(--name-${String(color ?? 0)})` }}
          >
            {message.authorName}
          </span>
        ) : null}
        <MessageContent message={message} />
        <BubbleMeta message={message} locale={locale} />
      </div>
    </div>
  );
}

export const MessageRow = memo(function MessageRow({
  message,
  prev,
  context,
  now,
  total,
  colors,
  onOpenActions,
}: MessageRowProps) {
  const layout = layoutRow(prev, message, context);
  const press = useLongPress(() => {
    onOpenActions(message);
  });
  const isPill = message.kind === 'system' || message.kind === 'call';
  return (
    <div className="pb-0.5">
      {layout.showDaySeparator ? (
        <DaySeparator message={message} now={now} locale={context.locale} />
      ) : null}
      <article
        aria-label={messageLabel(message, context)}
        aria-posinset={message.seq + 1}
        aria-setsize={total}
        data-seq={message.seq}
        className="relative"
      >
        <div className="[-webkit-touch-callout:none] pointer-coarse:select-none" {...press}>
          {isPill ? (
            <Pill message={message} isCall={message.kind === 'call'} />
          ) : (
            <Bubble
              message={message}
              layout={layout}
              color={message.authorId === null ? undefined : colors.get(message.authorId)}
              locale={context.locale}
            />
          )}
        </div>
        <button
          type="button"
          aria-haspopup="dialog"
          className="bg-surface-raised text-accent sr-only rounded-lg px-3 text-sm font-semibold focus:not-sr-only focus:absolute focus:end-3 focus:top-0 focus:min-h-11"
          onClick={() => {
            onOpenActions(message);
          }}
        >
          {en.chatView.actionsButton}
        </button>
      </article>
    </div>
  );
});

/** Stand-in for a row whose block is still loading. */
export function PendingRow({ seq, total }: { readonly seq: number; readonly total: number }) {
  return (
    <article
      aria-busy="true"
      aria-label={en.chatView.loadingMessage}
      aria-posinset={seq + 1}
      aria-setsize={total}
      className="px-3 py-1"
    >
      <div className="bg-surface-raised h-10 w-2/5 rounded-2xl opacity-60" />
    </article>
  );
}
