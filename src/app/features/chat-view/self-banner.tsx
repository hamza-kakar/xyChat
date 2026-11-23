/**
 * "Choose which person is you" (AGENTS.md §12.5): with no self chosen,
 * every bubble is incoming and this dismissible banner offers the choice.
 */
import { useState } from 'react';
import { en } from '../../i18n/en';
import { CloseIcon } from '../../components/icons';
import { Sheet, SheetButton } from '../../components/sheet';
import { useParticipants, useSetSelf } from '../../queries/chat-queries';
import type { ChatId } from '../../../core/ids';
import { selfBannerMemory } from './session-memory';

/** Props for {@link SelfBanner}. */
export interface SelfBannerProps {
  readonly chatId: ChatId;
}

export function SelfBanner({ chatId }: SelfBannerProps) {
  const [dismissed, setDismissed] = useState(() => selfBannerMemory.isDismissed(chatId));
  const [picking, setPicking] = useState(false);
  if (dismissed) {
    return null;
  }
  return (
    <aside className="bg-surface-raised border-border flex flex-wrap items-center gap-x-2 border-b py-1 ps-4 pe-1 text-sm">
      <p className="text-text min-w-40 flex-1">{en.chatView.selfBanner}</p>
      <button
        type="button"
        aria-haspopup="dialog"
        className="text-accent min-h-11 rounded-lg px-3 font-semibold"
        onClick={() => {
          setPicking(true);
        }}
      >
        {en.chatView.selfBannerChoose}
      </button>
      <button
        type="button"
        aria-label={en.chatView.selfBannerDismiss}
        className="text-text-muted flex min-h-11 min-w-11 items-center justify-center"
        onClick={() => {
          selfBannerMemory.dismiss(chatId);
          setDismissed(true);
        }}
      >
        <CloseIcon />
      </button>
      {picking ? (
        <SelfPicker
          chatId={chatId}
          onClose={() => {
            setPicking(false);
          }}
        />
      ) : null}
    </aside>
  );
}

function SelfPicker({
  chatId,
  onClose,
}: {
  readonly chatId: ChatId;
  readonly onClose: () => void;
}) {
  const participants = useParticipants(chatId);
  const setSelf = useSetSelf();
  return (
    <Sheet
      open
      title={en.chatView.selfPickerTitle}
      closeLabel={en.chatView.close}
      onClose={onClose}
    >
      {(participants.data ?? []).map((participant) => (
        <SheetButton
          key={participant.id}
          disabled={setSelf.isPending}
          onClick={() => {
            setSelf.mutate({ chatId, participantId: participant.id }, { onSuccess: onClose });
          }}
        >
          <span dir="auto">{participant.displayName}</span>
        </SheetButton>
      ))}
      {setSelf.isError ? (
        <p role="alert" className="text-danger text-sm">
          {en.chatActions.actionFailed}
        </p>
      ) : null}
      <SheetButton onClick={onClose}>{en.chatView.selfPickerNone}</SheetButton>
    </Sheet>
  );
}
