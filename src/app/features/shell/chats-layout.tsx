/**
 * Chats layout (AGENTS.md §12.1): one pane on phones, and on screens of
 * 768 px and wider the chat list beside the open chat.
 */
import { Outlet, useMatch } from 'react-router';
import { en } from '../../i18n/en';
import { ChatListPane } from '../chat-list';
import { AppErrorBoundary } from './app-error-boundary';

export function ChatsLayout() {
  const chatOpen = useMatch('/chat/:chatId') !== null;
  return (
    <div className="bg-surface flex min-h-dvh">
      <div
        className={
          chatOpen
            ? 'border-border hidden w-80 shrink-0 border-e md:flex'
            : 'border-border flex w-full md:w-80 md:shrink-0 md:border-e'
        }
      >
        <AppErrorBoundary>
          <ChatListPane asSidebar={chatOpen} />
        </AppErrorBoundary>
      </div>
      {chatOpen ? (
        <div className="flex min-w-0 flex-1">
          <AppErrorBoundary>
            <Outlet />
          </AppErrorBoundary>
        </div>
      ) : (
        <div className="hidden flex-1 items-center justify-center p-6 md:flex">
          <p className="text-text-muted">{en.chatList.selectChatHint}</p>
        </div>
      )}
    </div>
  );
}
