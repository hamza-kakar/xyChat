/**
 * Bookmark note editor ("Bookmark / Edit note"). An empty
 * note is stored as no note.
 */
import { useState } from 'react';
import type { ChatId } from '../../../core/ids';
import { en } from '../../i18n/en';
import { Sheet, SheetButton } from '../../components/sheet';
import { useUpdateBookmark } from '../../queries/bookmark-queries';

/** Longest note the worker accepts. */
const NOTE_MAX_LENGTH = 2000;

/** Props for {@link BookmarkNoteSheet}. */
export interface BookmarkNoteSheetProps {
  readonly chatId: ChatId;
  readonly bookmarkId: string;
  readonly initialNote: string | null;
  readonly onClose: () => void;
}

export function BookmarkNoteSheet({
  chatId,
  bookmarkId,
  initialNote,
  onClose,
}: BookmarkNoteSheetProps) {
  const [note, setNote] = useState(initialNote ?? '');
  const update = useUpdateBookmark();
  const trimmed = note.trim();
  return (
    <Sheet open title={en.bookmarks.noteTitle} closeLabel={en.bookmarks.close} onClose={onClose}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          update.mutate(
            { chatId, bookmarkId, note: trimmed === '' ? null : trimmed },
            { onSuccess: onClose },
          );
        }}
      >
        <label className="flex flex-col gap-1 text-sm">
          {en.bookmarks.noteLabel}
          <textarea
            value={note}
            maxLength={NOTE_MAX_LENGTH}
            rows={4}
            dir="auto"
            className="border-border bg-surface text-text rounded-lg border px-3 py-2 text-base"
            onChange={(event) => {
              setNote(event.target.value);
            }}
          />
        </label>
        {update.isError ? (
          <p role="alert" className="text-danger text-sm">
            {en.bookmarks.actionFailed}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={update.isPending}
          className="bg-accent text-accent-contrast min-h-11 rounded-lg px-4 font-semibold disabled:opacity-60"
        >
          {en.bookmarks.noteSave}
        </button>
        <SheetButton onClick={onClose}>{en.bookmarks.noteCancel}</SheetButton>
      </form>
    </Sheet>
  );
}
