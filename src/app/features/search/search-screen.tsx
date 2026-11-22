/**
 * Global search (AGENTS.md §11, §12.3 `#/search?q=`): search text kept in
 * the URL, filters for chat, sender, kinds and dates, and paged results
 * that open the chat at the message.
 */
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import * as v from 'valibot';
import { en } from '../../i18n/en';
import { BackIcon } from '../../components/icons';
import { useFocusHeading } from '../../hooks/use-focus-heading';
import { useDebouncedValue } from '../../hooks/use-debounced-value';
import { SEARCH } from '../../config';
import { SearchFilterPanel } from './search-filter-panel';
import { SearchResults } from './search-results';
import { EMPTY_FILTERS, toSearchFilters, type FilterState } from './search-filters';

/** Longest query the worker accepts. */
const QUERY_MAX_LENGTH = 500;
const QueryParam = v.pipe(v.string(), v.maxLength(QUERY_MAX_LENGTH));

/** The validated `?q=` value ('' when absent or invalid). */
function readQueryParam(params: URLSearchParams): string {
  const parsed = v.safeParse(QueryParam, params.get('q') ?? '');
  return parsed.success ? parsed.output : '';
}

export function SearchScreen() {
  const headingRef = useFocusHeading<HTMLHeadingElement>();
  const [params, setParams] = useSearchParams();
  const [text, setText] = useState(() => readQueryParam(params));
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const query = useDebouncedValue(text.trim(), SEARCH.DEBOUNCE_MS);
  return (
    <main className="bg-surface safe-sides-bottom flex min-h-dvh flex-col">
      <header className="border-border safe-top border-b">
        <div className="flex flex-col gap-1 py-1 ps-1 pe-4">
          <div className="flex items-center gap-1">
            <Link
              to="/"
              aria-label={en.search.backLabel}
              className="text-accent flex min-h-11 min-w-11 items-center justify-center rounded-full"
            >
              <BackIcon className="h-6 w-6 rtl:-scale-x-100" />
            </Link>
            <h1
              ref={headingRef}
              tabIndex={-1}
              className="text-text ps-2 text-lg font-semibold outline-none"
            >
              {en.search.title}
            </h1>
          </div>
          <form
            role="search"
            className="ps-3 pb-2"
            onSubmit={(event) => {
              event.preventDefault();
            }}
          >
            <input
              type="search"
              value={text}
              maxLength={QUERY_MAX_LENGTH}
              aria-label={en.search.inputLabel}
              placeholder={en.search.placeholder}
              enterKeyHint="search"
              dir="auto"
              className="border-border bg-surface-raised text-text min-h-11 w-full rounded-lg border px-3"
              onChange={(event) => {
                const next = event.target.value;
                setText(next);
                setParams(next === '' ? {} : { q: next }, { replace: true });
              }}
            />
          </form>
        </div>
      </header>
      <SearchFilterPanel state={filters} onChange={setFilters} />
      <SearchResults filters={toSearchFilters(query, filters)} />
    </main>
  );
}
