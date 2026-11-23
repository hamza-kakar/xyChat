/**
 * Chat info: the editable chat name.
 */
import { useState } from 'react';
import { en } from '../../i18n/en';
import { useRenameChat } from '../../queries/chat-queries';
import type { ChatId } from '../../../core/ids';

/** Props for {@link TitleEditor}. */
export interface TitleEditorProps {
  readonly chatId: ChatId;
  readonly title: string;
}

export function TitleEditor({ chatId, title }: TitleEditorProps) {
  const [draft, setDraft] = useState(title);
  const rename = useRenameChat();
  const trimmed = draft.trim();
  return (
    <form
      className="flex flex-col gap-2 px-4 py-5"
      onSubmit={(event) => {
        event.preventDefault();
        rename.mutate({ chatId, title: trimmed });
      }}
    >
      <label className="text-text-muted flex flex-col gap-1 text-sm">
        {en.chatInfo.titleLabel}
        <input
          value={draft}
          maxLength={200}
          dir="auto"
          className="border-border bg-surface-raised text-text min-h-11 rounded-lg border px-3 text-lg font-semibold"
          onChange={(event) => {
            rename.reset();
            setDraft(event.target.value);
          }}
        />
      </label>
      <button
        type="submit"
        disabled={trimmed === '' || trimmed === title || rename.isPending}
        className="bg-accent text-accent-contrast min-h-11 self-start rounded-lg px-4 font-semibold disabled:opacity-60"
      >
        {en.chatInfo.titleSave}
      </button>
      {rename.isSuccess ? (
        <p role="status" className="text-text-muted text-sm">
          {en.chatInfo.titleSaved}
        </p>
      ) : null}
      {rename.isError ? (
        <p role="alert" className="text-danger text-sm">
          {en.chatActions.actionFailed}
        </p>
      ) : null}
    </form>
  );
}
