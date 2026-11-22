/**
 * Chat info (AGENTS.md §12.3 `#/chat/:chatId/info`, §12.7): editable title,
 * group or one-to-one, date range, totals by kind, media, participants
 * with "This is me", import history, update from a newer export, delete.
 */
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import * as v from 'valibot';
import { asChatId, type ChatId } from '../../../core/ids';
import { en } from '../../i18n/en';
import { ScreenHeader } from '../../components/screen-header';
import { SettingsSection } from '../../components/settings-section';
import { useChat } from '../../queries/chat-queries';
import type { ChatView } from '../../../client/db-client';
import { DeleteChatSheet } from '../chat-list';
import { ChatStatsSections } from './chat-stats-sections';
import { ImportHistory } from './import-history';
import { ParticipantsSection } from './participants-section';
import { TitleEditor } from './title-editor';

/** Chat ids are generated UUIDs; anything else is not a chat. */
const ChatIdParam = v.pipe(v.string(), v.regex(/^[0-9a-f-]{8,64}$/iu));

export function ChatInfoScreen() {
  const params = useParams();
  const parsed = v.safeParse(ChatIdParam, params['chatId']);
  return (
    <main className="bg-surface safe-sides-bottom flex min-h-dvh flex-col">
      {parsed.success ? (
        <ChatInfoContent chatId={asChatId(parsed.output)} />
      ) : (
        <NotFound message={en.chatInfo.notFound} />
      )}
    </main>
  );
}

function NotFound({ message }: { readonly message: string }) {
  return (
    <>
      <ScreenHeader title={en.chatInfo.title} backTo="/" backLabel={en.chatView.backToChats} />
      <p role="alert" className="text-text-muted p-6">
        {message}
      </p>
    </>
  );
}

function ChatInfoContent({ chatId }: { readonly chatId: ChatId }) {
  const chat = useChat(chatId);
  if (chat.isPending) {
    return (
      <>
        <ScreenHeader
          title={en.chatInfo.title}
          backTo={`/chat/${chatId}`}
          backLabel={en.chatInfo.backLabel}
        />
        <p className="text-text-muted p-6">{en.chatInfo.loading}</p>
      </>
    );
  }
  if (chat.isError || chat.data === null) {
    return <NotFound message={chat.isError ? en.chatInfo.failed : en.chatInfo.notFound} />;
  }
  return <ChatInfoBody chat={chat.data} />;
}

function ChatInfoBody({ chat }: { readonly chat: ChatView }) {
  const [deleting, setDeleting] = useState(false);
  const navigate = useNavigate();
  return (
    <>
      <ScreenHeader
        title={en.chatInfo.title}
        backTo={`/chat/${chat.id}`}
        backLabel={en.chatInfo.backLabel}
      />
      <div className="divide-border mx-auto flex w-full max-w-2xl flex-col divide-y">
        <TitleEditor chatId={chat.id} title={chat.title} />
        <ChatStatsSections chat={chat} />
        <ParticipantsSection chatId={chat.id} selfId={chat.selfParticipantId} />
        <ImportHistory chatId={chat.id} />
        <SettingsSection heading={en.chatInfo.reimport}>
          <p className="text-text-muted text-sm">{en.chatInfo.reimportHint}</p>
          <Link
            to="/import"
            className="border-border text-text flex min-h-11 items-center rounded-lg border px-4 font-semibold"
          >
            {en.chatInfo.reimport}
          </Link>
          <button
            type="button"
            className="border-border text-danger min-h-11 rounded-lg border px-4 text-start font-semibold"
            onClick={() => {
              setDeleting(true);
            }}
          >
            {en.chatInfo.delete}
          </button>
        </SettingsSection>
      </div>
      {deleting ? (
        <DeleteChatSheet
          chat={chat}
          onClose={() => {
            setDeleting(false);
          }}
          onDeleted={() => {
            void navigate('/', { replace: true });
          }}
        />
      ) : null}
    </>
  );
}
