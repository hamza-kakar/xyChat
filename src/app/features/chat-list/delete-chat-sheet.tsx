/**
 * Delete-chat confirmation: states the message
 * count, media count and bytes before deleting the chat and its media.
 */
import { en } from '../../i18n/en';
import { formatBytes, formatString } from '../../i18n/format-string';
import { Sheet, SheetButton } from '../../components/sheet';
import { useChat, useDeleteChat } from '../../queries/chat-queries';
import type { ChatId } from '../../../core/ids';

/** Props for {@link DeleteChatSheet}. */
export interface DeleteChatSheetProps {
  readonly chat: {
    readonly id: ChatId;
    readonly title: string;
    readonly messageCount: number;
  };
  readonly onClose: () => void;
  /** Runs after the chat is gone (navigate away from its screens). */
  readonly onDeleted: () => void;
}

export function DeleteChatSheet({ chat, onClose, onDeleted }: DeleteChatSheetProps) {
  const details = useChat(chat.id);
  const remove = useDeleteChat();
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
          remove.mutate(chat.id, { onSuccess: onDeleted });
        }}
      >
        {en.chatActions.deleteConfirm}
      </button>
      <SheetButton onClick={onClose}>{en.chatActions.cancel}</SheetButton>
    </Sheet>
  );
}
