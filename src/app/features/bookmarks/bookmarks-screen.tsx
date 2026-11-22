/**
 * Bookmarks screen (AGENTS.md §12.3 `#/bookmarks`, §12.5): every bookmark,
 * newest first, with its chat, sender, time, text and note, and actions to
 * show it in its chat, edit the note or remove it.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { formatDateTime } from '../../../core/dates';
import { en } from '../../i18n/en';
import { formatString } from '../../i18n/format-string';
import { BackIcon } from '../../components/icons';
import { useFocusHeading } from '../../hooks/use-focus-heading';
import { useBookmarks, useRemoveBookmark } from '../../queries/bookmark-queries';
import { useChats } from '../../queries/chat-queries';
import type { BookmarkViewItem } from '../../../client/db-client';
import { BookmarkNoteSheet } from './bookmark-note-sheet';
import { bookmarkSummary, shortSummary } from './bookmark-summary';

export function BookmarksScreen() {
  const headingRef = useFocusHeading<HTMLHeadingElement>();
  return (
    <main className="bg-surface flex min-h-dvh flex-col">
      <header className="border-border safe-area flex items-center gap-1 border-b py-1 ps-1 pe-4">
        <Link
          to="/"
          aria-label={en.bookmarks.backLabel}
          className="text-accent flex min-h-11 min-w-11 items-center justify-center rounded-full"
        >
          <BackIcon className="h-6 w-6 rtl:-scale-x-100" />
        </Link>
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="text-text ps-2 text-lg font-semibold outline-none"
        >
          {en.bookmarks.title}
        </h1>
      </header>
      <BookmarkList />
    </main>
  );
}

function BookmarkList() {
  const bookmarks = useBookmarks(null);
  const chats = useChats();
  const [editing, setEditing] = useState<BookmarkViewItem | null>(null);
  const titles = useMemo(
    () => new Map((chats.data ?? []).map((chat) => [chat.id as string, chat.title])),
    [chats.data],
  );
  if (bookmarks.isPending) {
    return <p className="text-text-muted p-6">{en.bookmarks.loading}</p>;
  }
  if (bookmarks.isError) {
    return (
      <p role="alert" className="text-text-muted p-6">
        {en.bookmarks.failed}
      </p>
    );
  }
  if (bookmarks.data.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
        <p className="text-text text-lg font-semibold">{en.bookmarks.emptyTitle}</p>
        <p className="text-text-muted max-w-sm">{en.bookmarks.emptyBody}</p>
      </div>
    );
  }
  return (
    <>
      <ul className="divide-border flex flex-col divide-y">
        {bookmarks.data.map((item) => (
          <BookmarkItem
            key={item.bookmark.id}
            item={item}
            chatTitle={titles.get(item.bookmark.chatId) ?? en.search.unknownChat}
            onEdit={() => {
              setEditing(item);
            }}
          />
        ))}
      </ul>
      {editing === null ? null : (
        <BookmarkNoteSheet
          chatId={editing.bookmark.chatId}
          bookmarkId={editing.bookmark.id}
          initialNote={editing.bookmark.note}
          onClose={() => {
            setEditing(null);
          }}
        />
      )}
    </>
  );
}

function BookmarkItem({
  item,
  chatTitle,
  onEdit,
}: {
  readonly item: BookmarkViewItem;
  readonly chatTitle: string;
  readonly onEdit: () => void;
}) {
  const remove = useRemoveBookmark();
  const { bookmark, message } = item;
  const summary = bookmarkSummary(message);
  const actionClass = 'text-accent flex min-h-11 items-center rounded-lg px-3 font-semibold';
  return (
    <li className="flex flex-col gap-1 px-4 py-3">
      <p className="text-text-muted flex flex-wrap gap-x-2 text-sm">
        <span className="text-text font-semibold" dir="auto">
          {chatTitle}
        </span>
        <span dir="auto">{message.authorName ?? en.chatView.systemSender}</span>
        <span>{formatDateTime(message.tsLocal, { locale: navigator.language })}</span>
      </p>
      <p className="text-text line-clamp-3 break-words whitespace-pre-wrap" dir="auto">
        {summary}
      </p>
      {bookmark.note === null ? null : (
        <div className="bg-surface-raised rounded-lg px-3 py-2 text-sm">
          <p className="text-text-muted font-semibold">{en.bookmarks.noteHeading}</p>
          <p className="text-text break-words whitespace-pre-wrap" dir="auto">
            {bookmark.note}
          </p>
        </div>
      )}
      {remove.isError ? (
        <p role="alert" className="text-danger text-sm">
          {en.bookmarks.actionFailed}
        </p>
      ) : null}
      <div className="-ms-3 flex flex-wrap gap-1">
        <Link to={`/chat/${bookmark.chatId}?seq=${String(message.seq)}`} className={actionClass}>
          {en.bookmarks.showInChat}
        </Link>
        <button type="button" className={actionClass} onClick={onEdit}>
          {bookmark.note === null ? en.bookmarks.addNote : en.bookmarks.editNote}
        </button>
        <button
          type="button"
          aria-label={formatString(en.bookmarks.removeLabel, { summary: shortSummary(summary) })}
          disabled={remove.isPending}
          className={`${actionClass} disabled:opacity-60`}
          onClick={() => {
            remove.mutate({ chatId: bookmark.chatId, bookmarkId: bookmark.id });
          }}
        >
          {en.bookmarks.remove}
        </button>
      </div>
    </li>
  );
}
