/**
 * Chat row actions (AGENTS.md §12.4): rename, chat info, and delete behind
 * a confirmation that states the message count, media count and bytes.
 */
import { useState } from 'react';
import { useMatch, useNavigate } from 'react-router';
import { en } from '../../i18n/en';
import { Sheet, SheetButton } from '../../components/sheet';
import { useRenameChat } from '../../queries/chat-queries';
import type { ChatSummaryView } from '../../../client/db-client';
import { DeleteChatSheet } from './delete-chat-sheet';

/** Props for {@link ChatActionsSheet}. */
export interface ChatActionsSheetProps {
  readonly chat: ChatSummaryView;
  readonly onClose: () => void;
}

export function ChatActionsSheet({ chat, onClose }: ChatActionsSheetProps) {
  const [mode, setMode] = useState<'menu' | 'rename' | 'delete'>('menu');
  const navigate = useNavigate();
  const openChat = useMatch('/chat/:chatId');
  if (mode === 'rename') {
    return <RenameSheet chat={chat} onClose={onClose} />;
  }
  if (mode === 'delete') {
    return (
      <DeleteChatSheet
        chat={chat}
        onClose={onClose}
        onDeleted={() => {
          onClose();
          if (openChat?.params.chatId === chat.id) {
            void navigate('/', { replace: true });
          }
        }}
      />
    );
  }
  return (
    <Sheet open title={chat.title} closeLabel={en.chatActions.close} onClose={onClose}>
      <SheetButton
        onClick={() => {
          setMode('rename');
        }}
      >
        {en.chatActions.rename}
      </SheetButton>
      <SheetButton
        onClick={() => {
          onClose();
          void navigate(`/chat/${chat.id}/info`);
        }}
      >
        {en.chatInfo.title}
      </SheetButton>
      <SheetButton
        tone="danger"
        onClick={() => {
          setMode('delete');
        }}
      >
        {en.chatActions.delete}
      </SheetButton>
    </Sheet>
  );
}

function RenameSheet({ chat, onClose }: ChatActionsSheetProps) {
  const [title, setTitle] = useState(chat.title);
  const rename = useRenameChat();
  const trimmed = title.trim();
  return (
    <Sheet
      open
      title={en.chatActions.renameTitle}
      closeLabel={en.chatActions.close}
      onClose={onClose}
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          rename.mutate({ chatId: chat.id, title: trimmed }, { onSuccess: onClose });
        }}
      >
        <label className="flex flex-col gap-1 text-sm">
          {en.chatActions.renameLabel}
          <input
            value={title}
            maxLength={200}
            dir="auto"
            className="border-border bg-surface text-text min-h-11 rounded-lg border px-3 text-base"
            onChange={(event) => {
              setTitle(event.target.value);
            }}
          />
        </label>
        {rename.isError ? (
          <p role="alert" className="text-danger text-sm">
            {en.chatActions.actionFailed}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={trimmed === '' || rename.isPending}
          className="bg-accent text-accent-contrast min-h-11 rounded-lg px-4 font-semibold disabled:opacity-60"
        >
          {en.chatActions.renameSave}
        </button>
      </form>
    </Sheet>
  );
}
