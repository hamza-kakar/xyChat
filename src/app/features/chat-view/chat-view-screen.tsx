/**
 * The chat view (AGENTS.md §12.5): header, the self-choice banner and the
 * virtualized message log. The route parameter is validated (§12.3);
 * anything invalid or unknown shows "Not found".
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import * as v from 'valibot';
import { asChatId, type ChatId } from '../../../core/ids';
import { en } from '../../i18n/en';
import { formatString } from '../../i18n/format-string';
import { BackIcon } from '../../components/icons';
import { useFocusHeading } from '../../hooks/use-focus-heading';
import { mediaUrlCache } from '../../../platform/media-url';
import {
  useChat,
  useLastChatPosition,
  useParticipants,
  useSaveChatPosition,
} from '../../queries/chat-queries';
import type { ChatView, WindowMessage } from '../../../client/db-client';
import { MessageList } from './message-list';
import { SelfBanner } from './self-banner';
import { MessageActionsSheet } from './message-actions-sheet';
import { scrollMemory } from './session-memory';
import type { RowContext } from './row-model';

/** Chat ids are generated UUIDs; anything else is not a chat. */
const ChatIdParam = v.pipe(v.string(), v.regex(/^[0-9a-f-]{8,64}$/iu));

export function ChatViewScreen() {
  const params = useParams();
  const parsed = v.safeParse(ChatIdParam, params['chatId']);
  if (!parsed.success) {
    return <ChatMessage text={en.chatView.notFound} />;
  }
  return <ChatViewLoader key={parsed.output} chatId={asChatId(parsed.output)} />;
}

function ChatViewLoader({ chatId }: { readonly chatId: ChatId }) {
  const chat = useChat(chatId);
  const lastPosition = useLastChatPosition();
  if (chat.isPending || lastPosition.isPending) {
    return <ChatMessage text={en.chatView.loading} busy />;
  }
  if (chat.isError) {
    return <ChatMessage text={en.chatView.loadFailed} />;
  }
  if (chat.data === null) {
    return <ChatMessage text={en.chatView.notFound} />;
  }
  const remembered = scrollMemory.get(chatId);
  const stored = lastPosition.data?.chatId === chatId ? lastPosition.data.seq : undefined;
  return <ChatViewBody chat={chat.data} initialTopSeq={remembered ?? stored ?? null} />;
}

/** Saves the chat's position to `meta` on leave and when the app is hidden
 * (iOS may end a hidden app without further events). Revokes media URLs on
 * leave (§10.4). */
function usePersistPosition(chatId: ChatId): void {
  const save = useSaveChatPosition();
  const { mutate } = save;
  useEffect(() => {
    const persist = (): void => {
      const seq = scrollMemory.get(chatId);
      if (seq !== undefined) {
        mutate({ chatId, seq });
      }
    };
    const onVisibility = (): void => {
      if (document.visibilityState === 'hidden') {
        persist();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      persist();
      mediaUrlCache.clear();
    };
  }, [chatId, mutate]);
}

function ChatViewBody({
  chat,
  initialTopSeq,
}: {
  readonly chat: ChatView;
  readonly initialTopSeq: number | null;
}) {
  const participants = useParticipants(chat.id);
  const headingRef = useFocusHeading<HTMLHeadingElement>();
  const [actionsFor, setActionsFor] = useState<WindowMessage | null>(null);
  usePersistPosition(chat.id);
  const locale = navigator.language;
  const context = useMemo<RowContext>(
    () => ({ selfId: chat.selfParticipantId, isGroup: chat.isGroup, locale }),
    [chat.selfParticipantId, chat.isGroup, locale],
  );
  const colors = useMemo(
    () => new Map((participants.data ?? []).map((p) => [p.id as string, p.colorIndex])),
    [participants.data],
  );
  const onTopSeqChange = useCallback(
    (seq: number) => {
      scrollMemory.set(chat.id, seq);
    },
    [chat.id],
  );
  const onOpenActions = useCallback((message: WindowMessage) => {
    setActionsFor(message);
  }, []);
  return (
    <main className="bg-surface flex h-dvh min-w-0 flex-1 flex-col">
      <header className="border-border bg-surface safe-area flex items-center gap-1 border-b py-1 ps-1 pe-4">
        <Link
          to="/"
          aria-label={en.chatView.backLabel}
          className="text-accent flex min-h-11 min-w-11 items-center justify-center rounded-full md:hidden"
        >
          <BackIcon className="h-6 w-6 rtl:-scale-x-100" />
        </Link>
        <div className="flex min-w-0 flex-1 flex-col ps-2 md:ps-3">
          <h1
            ref={headingRef}
            tabIndex={-1}
            className="text-text truncate text-lg font-semibold outline-none"
            dir="auto"
          >
            {chat.title}
          </h1>
          {chat.isGroup && participants.data !== undefined ? (
            <p className="text-text-muted text-xs">
              {formatString(en.chatView.participants, { count: participants.data.length })}
            </p>
          ) : null}
        </div>
      </header>
      {chat.selfParticipantId === null ? <SelfBanner chatId={chat.id} /> : null}
      <MessageList
        chatId={chat.id}
        title={chat.title}
        total={chat.messageCount}
        context={context}
        colors={colors}
        initialTopSeq={initialTopSeq}
        onTopSeqChange={onTopSeqChange}
        onOpenActions={onOpenActions}
      />
      {actionsFor === null ? null : (
        <MessageActionsSheet
          chatId={chat.id}
          message={actionsFor}
          locale={locale}
          onClose={() => {
            setActionsFor(null);
          }}
        />
      )}
    </main>
  );
}

/** Loading, error and not-found states, with a way back. */
function ChatMessage({ text, busy = false }: { readonly text: string; readonly busy?: boolean }) {
  return (
    <main
      aria-busy={busy}
      className="bg-surface flex min-h-dvh flex-1 flex-col items-center justify-center gap-3 p-6 text-center"
    >
      <h1 className="text-text text-lg font-semibold">{text}</h1>
      {busy ? null : (
        <Link to="/" className="text-accent min-h-11 rounded-lg px-4 py-2 font-semibold">
          {en.chatView.backToChats}
        </Link>
      )}
    </main>
  );
}
