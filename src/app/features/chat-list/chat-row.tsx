import { memo } from 'react';
import { Link } from 'react-router';
import { en } from '../../i18n/en';
import { formatString } from '../../i18n/format-string';
import { formatListStamp, fromTsKey } from '../../../core/dates';
import type { LocalDateTime } from '../../../core/model';
import type { ChatSummaryView } from '../../../client/db-client';
import { GroupIcon, MoreIcon } from '../../components/icons';
import { useLongPress } from '../../hooks/use-long-press';
import { Avatar } from './avatar';
import { chatPreview } from './chat-preview';

/** Props for {@link ChatRow}. */
export interface ChatRowProps {
  readonly chat: ChatSummaryView;
  readonly now: LocalDateTime;
  readonly locale: string;
  readonly isActive: boolean;
  readonly onOpenActions: (chat: ChatSummaryView) => void;
}

/** One chat-list row (§12.4): avatar, title, preview, last-message date,
 * group icon; long-press, right-click or the ⋯ button open its actions. */
export const ChatRow = memo(function ChatRow({
  chat,
  now,
  locale,
  isActive,
  onOpenActions,
}: ChatRowProps) {
  const press = useLongPress(() => {
    onOpenActions(chat);
  });
  const stamp =
    chat.lastTsKey === null ? '' : formatListStamp(fromTsKey(chat.lastTsKey), now, { locale });
  return (
    <li className="flex items-center">
      <Link
        to={`/chat/${chat.id}`}
        aria-current={isActive ? 'page' : undefined}
        className={`flex min-h-16 min-w-0 flex-1 items-center gap-3 py-2 ps-4 select-none [-webkit-touch-callout:none] ${
          isActive ? 'bg-surface-raised' : ''
        }`}
        {...press}
      >
        <Avatar title={chat.title} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex items-baseline gap-2">
            <span className="text-text min-w-0 flex-1 truncate font-semibold" dir="auto">
              {chat.title}
            </span>
            {chat.isGroup ? (
              <span className="text-text-muted shrink-0" title={en.chatList.groupLabel}>
                <GroupIcon className="h-4 w-4" />
                <span className="sr-only">{en.chatList.groupLabel}</span>
              </span>
            ) : null}
            <span className="text-text-muted shrink-0 text-xs">{stamp}</span>
          </span>
          <span className="text-text-muted truncate text-sm" dir="auto">
            {chatPreview(chat)}
          </span>
        </span>
      </Link>
      <button
        type="button"
        aria-label={formatString(en.chatList.rowMoreLabel, { title: chat.title })}
        aria-haspopup="dialog"
        className="text-text-muted flex min-h-11 min-w-11 items-center justify-center rounded-full"
        onClick={() => {
          onOpenActions(chat);
        }}
      >
        <MoreIcon />
      </button>
    </li>
  );
});
