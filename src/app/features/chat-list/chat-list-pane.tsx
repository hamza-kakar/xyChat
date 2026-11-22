/**
 * The chat list (AGENTS.md §12.4): rows sorted by last activity (SQL),
 * an instant local title filter, the Import action and the empty state.
 * It is the page's main content on its own route and a navigation pane
 * beside an open chat on wide screens (§12.1).
 */
import { useCallback, useState } from 'react';
import { Link, useMatch } from 'react-router';
import { APP_NAME } from '../../config';
import { en } from '../../i18n/en';
import { formatString } from '../../i18n/format-string';
import { isStandalone } from '../../../platform/install';
import type { ChatSummaryView } from '../../../client/db-client';
import { PlusIcon } from '../../components/icons';
import { useChats } from '../../queries/chat-queries';
import { useFocusHeading } from '../../hooks/use-focus-heading';
import { useLocalNow } from '../../hooks/use-local-now';
import { ChatRow } from './chat-row';
import { ChatActionsSheet } from './chat-actions-sheet';
import { InstallBanner } from './install-banner';

/** Props for {@link ChatListPane}. */
export interface ChatListPaneProps {
  /** True when a chat is open beside the list (wide screens). */
  readonly asSidebar: boolean;
}

export function ChatListPane({ asSidebar }: ChatListPaneProps) {
  const headingRef = useFocusHeading<HTMLHeadingElement>();
  const Root = asSidebar ? 'nav' : 'main';
  const Heading = asSidebar ? 'h2' : 'h1';
  return (
    <Root
      aria-label={asSidebar ? en.chatList.heading : undefined}
      className="bg-surface flex min-h-dvh w-full flex-col"
    >
      <header className="border-border flex items-center gap-2 border-b py-2 ps-4 pe-2">
        <Heading
          ref={asSidebar ? undefined : headingRef}
          tabIndex={-1}
          className="text-text flex-1 text-xl font-bold outline-none"
        >
          {APP_NAME}
        </Heading>
        <Link
          to="/import"
          className="text-accent flex min-h-11 items-center gap-1 rounded-lg px-3 font-semibold"
        >
          <PlusIcon />
          {en.chatList.importButton}
        </Link>
      </header>
      <InstallBanner />
      <ChatListBody />
    </Root>
  );
}

function ChatListBody() {
  const chats = useChats();
  const [filter, setFilter] = useState('');
  const [actionsFor, setActionsFor] = useState<ChatSummaryView | null>(null);
  const now = useLocalNow();
  const openChat = useMatch('/chat/:chatId');
  const onOpenActions = useCallback((chat: ChatSummaryView) => {
    setActionsFor(chat);
  }, []);

  if (chats.isPending) {
    return <p className="text-text-muted p-6">{en.chatList.loading}</p>;
  }
  if (chats.isError) {
    return (
      <p role="alert" className="text-text-muted p-6">
        {en.chatList.loadFailed}
      </p>
    );
  }
  if (chats.data.length === 0) {
    return <EmptyState />;
  }
  const needle = filter.trim().toLocaleLowerCase();
  const visible =
    needle === ''
      ? chats.data
      : chats.data.filter((chat) => chat.title.toLocaleLowerCase().includes(needle));
  const locale = navigator.language;
  return (
    <>
      <div className="px-4 py-2">
        <input
          type="search"
          value={filter}
          aria-label={en.chatList.filterLabel}
          placeholder={en.chatList.filterPlaceholder}
          className="border-border bg-surface-raised text-text min-h-11 w-full rounded-lg border px-3"
          onChange={(event) => {
            setFilter(event.target.value);
          }}
        />
      </div>
      {visible.length === 0 ? (
        <p className="text-text-muted px-6 py-4">
          {formatString(en.chatList.noFilterMatches, { filter: filter.trim() })}
        </p>
      ) : (
        <ul className="divide-border flex flex-col divide-y">
          {visible.map((chat) => (
            <ChatRow
              key={chat.id}
              chat={chat}
              now={now}
              locale={locale}
              isActive={openChat?.params.chatId === chat.id}
              onOpenActions={onOpenActions}
            />
          ))}
        </ul>
      )}
      {actionsFor === null ? null : (
        <ChatActionsSheet
          chat={actionsFor}
          onClose={() => {
            setActionsFor(null);
          }}
        />
      )}
    </>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <p className="text-text text-lg font-semibold">{en.chatList.emptyTitle}</p>
      <p className="text-text-muted max-w-sm">{en.tagline}</p>
      <p className="text-text-muted max-w-sm text-sm">{en.chatList.emptyBody}</p>
      {isStandalone() ? null : (
        <p className="text-text-muted max-w-sm text-sm">
          {formatString(en.chatList.emptyInstallHint, { appName: APP_NAME })}
        </p>
      )}
      <Link
        to="/import"
        className="bg-accent text-accent-contrast mt-2 flex min-h-11 items-center rounded-lg px-6 font-semibold"
      >
        {en.home.importButton}
      </Link>
    </div>
  );
}
