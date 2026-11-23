/**
 * The chat view: header, in-chat search, the self-choice
 * banner, the virtualized message log and jump to date. Route parameters
 * are validated: an invalid chat id shows "Not found"; an invalid
 * `?seq` or `?q` is ignored.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import * as v from 'valibot';
import { asChatId, type ChatId } from '../../../core/ids';
import { en } from '../../i18n/en';
import { JUMP_HIGHLIGHT_MS } from '../../config';
import { useFocusHeading } from '../../hooks/use-focus-heading';
import { mediaUrlCache } from '../../../platform/media-url';
import {
  useChat,
  useLastChatPosition,
  useParticipants,
  useSaveChatPosition,
} from '../../queries/chat-queries';
import type { ChatView, WindowMessage } from '../../../client/db-client';
import { useBookmarks } from '../../queries/bookmark-queries';
import { MessageList, type JumpRequest } from './message-list';
import { ChatHeader } from './chat-header';
import { InChatSearch } from './in-chat-search';
import { JumpToDateSheet } from './jump-to-date-sheet';
import { SelfBanner } from './self-banner';
import { MessageActionsSheet } from './message-actions-sheet';
import { scrollMemory } from './session-memory';
import { OpenMediaContext, type OpenMedia } from './open-media-context';
import { MediaViewer, type ViewerItem } from '../media';
import type { RowContext } from './row-model';

/** Chat ids are generated UUIDs; anything else is not a chat. */
const ChatIdParam = v.pipe(v.string(), v.regex(/^[0-9a-f-]{8,64}$/iu));
/** `?seq=N` opens the chat at a message. */
const SeqParam = v.pipe(v.string(), v.regex(/^\d{1,9}$/u), v.transform(Number));
/** `?q=` opens in-chat search with a query. */
const QueryParam = v.pipe(v.string(), v.minLength(1), v.maxLength(500));

/** A validated optional search param, or null. */
function readParam<T>(schema: v.GenericSchema<string, T>, raw: string | null): T | null {
  if (raw === null) {
    return null;
  }
  const parsed = v.safeParse(schema, raw);
  return parsed.success ? parsed.output : null;
}

export function ChatViewScreen() {
  const params = useParams();
  const [search] = useSearchParams();
  const parsed = v.safeParse(ChatIdParam, params['chatId']);
  if (!parsed.success) {
    return <ChatMessage text={en.chatView.notFound} />;
  }
  const seq = readParam(SeqParam, search.get('seq'));
  const query = readParam(QueryParam, search.get('q'));
  // A new linked message re-opens the view at it.
  return (
    <ChatViewLoader
      key={`${parsed.output}:${String(seq)}`}
      chatId={asChatId(parsed.output)}
      linkedSeq={seq}
      initialQuery={query}
    />
  );
}

function ChatViewLoader({
  chatId,
  linkedSeq,
  initialQuery,
}: {
  readonly chatId: ChatId;
  readonly linkedSeq: number | null;
  readonly initialQuery: string | null;
}) {
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
  const linked = linkedSeq !== null && linkedSeq < chat.data.messageCount ? linkedSeq : null;
  const remembered = scrollMemory.get(chatId);
  const stored = lastPosition.data?.chatId === chatId ? lastPosition.data.seq : undefined;
  return (
    <ChatViewBody
      chat={chat.data}
      initialTopSeq={linked ?? remembered ?? stored ?? null}
      linkedSeq={linked}
      initialQuery={initialQuery}
    />
  );
}

/** Saves the chat's position to `meta` on leave and when the app is hidden
 * (iOS may end a hidden app without further events). Revokes media URLs on
 * leave. */
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

/** Jump requests and the brief highlight they leave. */
function useJumps(linkedSeq: number | null) {
  const token = useRef(0);
  const [jump, setJump] = useState<JumpRequest | null>(null);
  const [highlight, setHighlight] = useState<JumpRequest | null>(
    linkedSeq === null ? null : { seq: linkedSeq, token: 0 },
  );
  useEffect(() => {
    if (highlight === null) {
      return undefined;
    }
    const timer = setTimeout(() => {
      setHighlight(null);
    }, JUMP_HIGHLIGHT_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [highlight]);
  const jumpTo = useCallback((seq: number) => {
    token.current += 1;
    const request = { seq, token: token.current };
    setJump(request);
    setHighlight(request);
  }, []);
  return { jump, highlightSeq: highlight?.seq ?? null, jumpTo };
}

function ChatViewBody({
  chat,
  initialTopSeq,
  linkedSeq,
  initialQuery,
}: {
  readonly chat: ChatView;
  readonly initialTopSeq: number | null;
  readonly linkedSeq: number | null;
  readonly initialQuery: string | null;
}) {
  const participants = useParticipants(chat.id);
  const bookmarks = useBookmarks(chat.id);
  const headingRef = useFocusHeading<HTMLHeadingElement>();
  const searchButtonRef = useRef<HTMLButtonElement>(null);
  const [actionsFor, setActionsFor] = useState<WindowMessage | null>(null);
  const [isSearchOpen, setSearchOpen] = useState(initialQuery !== null);
  const [focusSearch, setFocusSearch] = useState(false);
  const [isJumpOpen, setJumpOpen] = useState(false);
  const { jump, highlightSeq, jumpTo } = useJumps(linkedSeq);
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
  const bookmarkByMessage = useMemo(
    () => new Map((bookmarks.data ?? []).map((item) => [item.bookmark.messageId, item.bookmark])),
    [bookmarks.data],
  );
  const bookmarked = useMemo(() => new Set(bookmarkByMessage.keys()), [bookmarkByMessage]);
  const onTopSeqChange = useCallback(
    (seq: number) => {
      scrollMemory.set(chat.id, seq);
    },
    [chat.id],
  );
  const onOpenActions = useCallback((message: WindowMessage) => {
    setActionsFor(message);
  }, []);
  const [mediaFor, setMediaFor] = useState<ViewerItem | null>(null);
  const openMedia = useCallback<OpenMedia>((message, attachment) => {
    setMediaFor({ message, attachment });
  }, []);
  const hasRange = chat.firstTsKey !== null && chat.lastTsKey !== null;
  return (
    <main className="bg-surface safe-sides-bottom flex h-dvh min-w-0 flex-1 flex-col">
      <ChatHeader
        chatId={chat.id}
        title={chat.title}
        participantCount={chat.isGroup ? (participants.data?.length ?? null) : null}
        headingRef={headingRef}
        searchButtonRef={searchButtonRef}
        isSearchOpen={isSearchOpen}
        canJump={chat.messageCount > 0 && hasRange}
        onSearch={() => {
          setFocusSearch(true);
          setSearchOpen((open) => !open);
        }}
        onJump={() => {
          setJumpOpen(true);
        }}
      />
      {isSearchOpen ? (
        <InChatSearch
          chatId={chat.id}
          initialQuery={initialQuery ?? ''}
          focusOnOpen={focusSearch}
          onJump={jumpTo}
          onClose={() => {
            setSearchOpen(false);
            searchButtonRef.current?.focus();
          }}
        />
      ) : null}
      {chat.selfParticipantId === null ? <SelfBanner chatId={chat.id} /> : null}
      <OpenMediaContext value={openMedia}>
        <MessageList
          chatId={chat.id}
          title={chat.title}
          total={chat.messageCount}
          context={context}
          colors={colors}
          initialTopSeq={initialTopSeq}
          initialAlign={linkedSeq === null ? 'start' : 'center'}
          jump={jump}
          highlightSeq={highlightSeq}
          bookmarked={bookmarked}
          onTopSeqChange={onTopSeqChange}
          onOpenActions={onOpenActions}
        />
      </OpenMediaContext>
      {mediaFor === null ? null : (
        <MediaViewer
          chatId={chat.id}
          items={[mediaFor]}
          index={0}
          onIndexChange={() => undefined}
          onClose={() => {
            setMediaFor(null);
          }}
          showInChat={false}
        />
      )}
      {isJumpOpen && chat.firstTsKey !== null && chat.lastTsKey !== null ? (
        <JumpToDateSheet
          chatId={chat.id}
          firstTsKey={chat.firstTsKey}
          lastTsKey={chat.lastTsKey}
          total={chat.messageCount}
          locale={locale}
          onJump={jumpTo}
          onClose={() => {
            setJumpOpen(false);
          }}
        />
      ) : null}
      {actionsFor === null ? null : (
        <MessageActionsSheet
          chatId={chat.id}
          message={actionsFor}
          bookmark={bookmarkByMessage.get(actionsFor.rowId) ?? null}
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
