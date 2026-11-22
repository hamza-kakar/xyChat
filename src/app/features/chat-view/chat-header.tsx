/**
 * Chat view header (AGENTS.md §12.5): back, title, participant count for
 * groups, and the search and jump-to-date buttons.
 */
import type { Ref } from 'react';
import { Link } from 'react-router';
import { en } from '../../i18n/en';
import { formatString } from '../../i18n/format-string';
import { BackIcon, CalendarIcon, SearchIcon } from '../../components/icons';

/** Props for {@link ChatHeader}. */
export interface ChatHeaderProps {
  readonly title: string;
  readonly participantCount: number | null;
  readonly headingRef: Ref<HTMLHeadingElement>;
  readonly searchButtonRef: Ref<HTMLButtonElement>;
  readonly isSearchOpen: boolean;
  /** False for a chat without messages (nothing to jump to). */
  readonly canJump: boolean;
  readonly onSearch: () => void;
  readonly onJump: () => void;
}

const iconButtonClass =
  'text-accent flex min-h-11 min-w-11 items-center justify-center rounded-full';

export function ChatHeader({
  title,
  participantCount,
  headingRef,
  searchButtonRef,
  isSearchOpen,
  canJump,
  onSearch,
  onJump,
}: ChatHeaderProps) {
  return (
    <header className="border-border bg-surface safe-area flex items-center gap-1 border-b py-1 ps-1 pe-2">
      <Link to="/" aria-label={en.chatView.backLabel} className={`${iconButtonClass} md:hidden`}>
        <BackIcon className="h-6 w-6 rtl:-scale-x-100" />
      </Link>
      <div className="flex min-w-0 flex-1 flex-col ps-2 md:ps-3">
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="text-text truncate text-lg font-semibold outline-none"
          dir="auto"
        >
          {title}
        </h1>
        {participantCount === null ? null : (
          <p className="text-text-muted text-xs">
            {formatString(en.chatView.participants, { count: participantCount })}
          </p>
        )}
      </div>
      <button
        ref={searchButtonRef}
        type="button"
        aria-label={en.chatView.searchButton}
        aria-expanded={isSearchOpen}
        disabled={!canJump}
        className={`${iconButtonClass} disabled:opacity-40`}
        onClick={onSearch}
      >
        <SearchIcon className="h-6 w-6" />
      </button>
      <button
        type="button"
        aria-label={en.chatView.jumpButton}
        aria-haspopup="dialog"
        disabled={!canJump}
        className={`${iconButtonClass} disabled:opacity-40`}
        onClick={onJump}
      >
        <CalendarIcon className="h-6 w-6" />
      </button>
    </header>
  );
}
