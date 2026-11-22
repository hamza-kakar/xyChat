/**
 * In-chat search (AGENTS.md §11): a result counter ("12 of 87") with
 * previous/next. It starts at the newest match; "previous" walks back in
 * time. Every move asks the list to scroll to the match and highlight it.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { ChatId } from '../../../core/ids';
import { en } from '../../i18n/en';
import { formatString } from '../../i18n/format-string';
import { ChevronDownIcon, ChevronUpIcon, CloseIcon } from '../../components/icons';
import { useDebouncedValue } from '../../hooks/use-debounced-value';
import { useInChatMatches } from '../../queries/search-queries';
import { SEARCH } from '../../config';

/** Longest query the worker accepts. */
const QUERY_MAX_LENGTH = 500;

/** Props for {@link InChatSearch}. */
export interface InChatSearchProps {
  readonly chatId: ChatId;
  readonly initialQuery: string;
  /** True when the user opened the bar; a `?q=` link keeps focus on the
   * page heading (§16). */
  readonly focusOnOpen: boolean;
  readonly onJump: (seq: number) => void;
  readonly onClose: () => void;
}

/** Which match is selected, tied to the query it was chosen for. */
interface Selection {
  readonly query: string;
  readonly index: number;
}

export function InChatSearch({
  chatId,
  initialQuery,
  focusOnOpen,
  onJump,
  onClose,
}: InChatSearchProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(initialQuery);
  const query = useDebouncedValue(text.trim(), SEARCH.DEBOUNCE_MS);
  const matches = useInChatMatches(chatId, query);
  const [selection, setSelection] = useState<Selection | null>(null);
  const seqs = query === '' ? [] : (matches.data?.seqs ?? []);
  // A new query starts at the newest match.
  const index = selection?.query === query ? selection.index : seqs.length - 1;
  const currentSeq = seqs[index];

  useEffect(() => {
    if (focusOnOpen) {
      inputRef.current?.focus();
    }
  }, [focusOnOpen]);

  // Scrolling the list is the side effect this selection drives.
  useEffect(() => {
    if (currentSeq !== undefined) {
      onJump(currentSeq);
    }
  }, [currentSeq, onJump]);

  const move = (step: number): void => {
    const next = index + step;
    if (next >= 0 && next < seqs.length) {
      setSelection({ query, index: next });
    }
  };

  return (
    <div className="border-border bg-surface flex flex-col gap-1 border-b px-2 py-1">
      <form
        role="search"
        className="flex items-center gap-1"
        onSubmit={(event) => {
          event.preventDefault();
          move(-1);
        }}
      >
        <input
          ref={inputRef}
          type="search"
          value={text}
          maxLength={QUERY_MAX_LENGTH}
          aria-label={en.chatView.searchLabel}
          placeholder={en.chatView.searchPlaceholder}
          enterKeyHint="search"
          dir="auto"
          className="border-border bg-surface-raised text-text min-h-11 min-w-0 flex-1 rounded-lg border px-3"
          onChange={(event) => {
            setText(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              onClose();
            }
          }}
        />
        <SearchCounter
          query={query}
          index={index}
          total={seqs.length}
          isCapped={matches.data?.isCapped ?? false}
          isPending={query !== '' && matches.isPending}
          isError={matches.isError}
        />
        <IconButton
          label={en.chatView.searchPrevious}
          disabled={index <= 0}
          onClick={() => {
            move(-1);
          }}
        >
          <ChevronUpIcon className="h-6 w-6" />
        </IconButton>
        <IconButton
          label={en.chatView.searchNext}
          disabled={index < 0 || index >= seqs.length - 1}
          onClick={() => {
            move(1);
          }}
        >
          <ChevronDownIcon className="h-6 w-6" />
        </IconButton>
        <IconButton label={en.chatView.searchClose} disabled={false} onClick={onClose}>
          <CloseIcon className="h-6 w-6" />
        </IconButton>
      </form>
      {query !== '' && query.length < SEARCH.MIN_FULL_TEXT_LENGTH ? (
        <p className="text-text-muted px-1 text-xs">{en.chatView.searchShortHint}</p>
      ) : null}
    </div>
  );
}

function SearchCounter(props: {
  readonly query: string;
  readonly index: number;
  readonly total: number;
  readonly isCapped: boolean;
  readonly isPending: boolean;
  readonly isError: boolean;
}) {
  let text = '';
  if (props.isError) {
    text = en.chatView.searchFailed;
  } else if (props.query !== '' && !props.isPending) {
    text =
      props.total === 0
        ? en.chatView.searchNoMatches
        : formatString(
            props.isCapped ? en.chatView.searchCounterCapped : en.chatView.searchCounter,
            {
              current: props.index + 1,
              total: props.total,
            },
          );
  }
  return (
    <span role="status" className="text-text-muted shrink-0 px-1 text-sm whitespace-nowrap">
      {text}
    </span>
  );
}

function IconButton(props: {
  readonly label: string;
  readonly disabled: boolean;
  readonly onClick: () => void;
  readonly children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={props.label}
      disabled={props.disabled}
      className="text-accent flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full disabled:opacity-40"
      onClick={props.onClick}
    >
      {props.children}
    </button>
  );
}
