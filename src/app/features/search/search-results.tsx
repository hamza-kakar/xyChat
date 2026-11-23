/**
 * Search result list: each hit names its chat, sender and
 * time and shows the ±40-character snippet with the matches marked; it
 * opens the chat at that message. Paging is keyset-based ("Show more").
 */
import { useId, useMemo } from 'react';
import { Link } from 'react-router';
import { formatDateTime } from '../../../core/dates';
import { en } from '../../i18n/en';
import { formatString } from '../../i18n/format-string';
import { HighlightedText } from '../../components/highlighted-text';
import { useChats } from '../../queries/chat-queries';
import { canSearch, useSearchResults, type SearchFilters } from '../../queries/search-queries';
import { SEARCH } from '../../config';
import type { SearchHitView } from '../../../client/db-client';

/** Props for {@link SearchResults}. */
export interface SearchResultsProps {
  readonly filters: SearchFilters;
}

export function SearchResults({ filters }: SearchResultsProps) {
  const results = useSearchResults(filters);
  const chats = useChats();
  const countId = useId();
  const titles = useMemo(
    () => new Map((chats.data ?? []).map((chat) => [chat.id as string, chat.title])),
    [chats.data],
  );
  if (!canSearch(filters)) {
    return filters.query === '' ? null : <Hint text={en.search.minLengthHint} />;
  }
  if (results.isPending) {
    return <Hint text={en.search.searching} busy />;
  }
  if (results.isError) {
    return <Hint text={en.search.failed} alert />;
  }
  const hits = results.data.pages.flatMap((page) => page.hits);
  if (hits.length === 0) {
    return <Hint text={formatString(en.search.noResults, { query: filters.query })} />;
  }
  const isShort = filters.query.length < SEARCH.MIN_FULL_TEXT_LENGTH;
  return (
    <section aria-labelledby={countId} className="flex flex-col">
      <p id={countId} role="status" className="text-text-muted px-4 py-2 text-sm">
        {formatString(results.hasNextPage ? en.search.resultCountMore : en.search.resultCount, {
          count: hits.length,
        })}
        {isShort ? ` ${en.search.shortQueryHint}` : null}
      </p>
      <ul className="divide-border flex flex-col divide-y">
        {hits.map((hit) => (
          <ResultItem
            key={hit.messageRowId}
            hit={hit}
            query={filters.query}
            chatTitle={titles.get(hit.chatId) ?? en.search.unknownChat}
          />
        ))}
      </ul>
      {results.hasNextPage ? (
        <button
          type="button"
          disabled={results.isFetchingNextPage}
          className="text-accent min-h-11 rounded-lg px-4 py-2 font-semibold disabled:opacity-60"
          onClick={() => {
            void results.fetchNextPage();
          }}
        >
          {results.isFetchingNextPage ? en.search.loadingMore : en.search.loadMore}
        </button>
      ) : null}
    </section>
  );
}

function ResultItem({
  hit,
  query,
  chatTitle,
}: {
  readonly hit: SearchHitView;
  readonly query: string;
  readonly chatTitle: string;
}) {
  const sender = hit.authorName ?? en.chatView.systemSender;
  const time = formatDateTime(hit.tsLocal, { locale: navigator.language });
  return (
    <li>
      <Link
        to={`/chat/${hit.chatId}?seq=${String(hit.seq)}`}
        className="flex min-h-11 flex-col gap-0.5 px-4 py-3"
      >
        <span className="flex items-baseline justify-between gap-2">
          <span className="text-text truncate font-semibold" dir="auto">
            {chatTitle}
          </span>
          <span className="text-text-muted shrink-0 text-xs">{time}</span>
        </span>
        <span className="text-text-muted truncate text-sm" dir="auto">
          {sender}
        </span>
        <span className="text-text line-clamp-2 text-sm break-words" dir="auto">
          <HighlightedText text={hit.snippet} query={query} />
        </span>
      </Link>
    </li>
  );
}

function Hint({
  text,
  busy = false,
  alert = false,
}: {
  readonly text: string;
  readonly busy?: boolean;
  readonly alert?: boolean;
}) {
  return (
    <p
      role={alert ? 'alert' : 'status'}
      aria-busy={busy}
      className="text-text-muted px-6 py-6 text-center"
    >
      {text}
    </p>
  );
}
