/**
 * Chat row actions (AGENTS.md §12.4): rename, and delete behind a
 * confirmation that states the message count, media count and bytes.
 */
import { useState } from 'react';
import { useMatch, useNavigate } from 'react-router';
import { en } from '../../i18n/en';
import { formatBytes, formatString } from '../../i18n/format-string';
import { Sheet, SheetButton } from '../../components/sheet';
import { useChat, useDeleteChat, useRenameChat } from '../../queries/chat-queries';
import type { ChatSummaryView } from '../../../client/db-client';

/** Props for {@link ChatActionsSheet}. */
export interface ChatActionsSheetProps {
  readonly chat: ChatSummaryView;
  readonly onClose: () => void;
}

export function ChatActionsSheet({ chat, onClose }: ChatActionsSheetProps) {
  const [mode, setMode] = useState<'menu' | 'rename' | 'delete'>('menu');
  if (mode === 'rename') {
    return <RenameSheet chat={chat} onClose={onClose} />;
  }
  if (mode === 'delete') {
    return <DeleteSheet chat={chat} onClose={onClose} />;
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

function DeleteSheet({ chat, onClose }: ChatActionsSheetProps) {
  const details = useChat(chat.id);
  const remove = useDeleteChat();
  const navigate = useNavigate();
  const openChat = useMatch('/chat/:chatId');
  const media = details.data?.mediaCount ?? 0;
  const bytes = details.data?.mediaBytes ?? 0;
  return (
    <Sheet
      open
      title={formatString(en.chatActions.deleteTitle, { title: chat.title })}
      closeLabel={en.chatActions.close}
      onClose={onClose}
    >
      <p className="text-text-muted text-sm">
        {formatString(en.chatActions.deleteBody, {
          messages: chat.messageCount,
          media,
          bytes: formatBytes(bytes),
        })}
      </p>
      {remove.isError ? (
        <p role="alert" className="text-danger text-sm">
          {en.chatActions.actionFailed}
        </p>
      ) : null}
      <button
        type="button"
        disabled={remove.isPending || details.isPending}
        className="bg-danger text-danger-contrast min-h-11 rounded-lg px-4 font-semibold disabled:opacity-60"
        onClick={() => {
          remove.mutate(chat.id, {
            onSuccess: () => {
              onClose();
              if (openChat?.params.chatId === chat.id) {
                void navigate('/', { replace: true });
              }
            },
          });
        }}
      >
        {en.chatActions.deleteConfirm}
      </button>
      <SheetButton onClick={onClose}>{en.chatActions.cancel}</SheetButton>
    </Sheet>
  );
}
