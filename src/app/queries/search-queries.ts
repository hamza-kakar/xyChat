/**
 * Search queries (AGENTS.md §11, §18.4): global/filtered result pages with
 * keyset paging, the in-chat match list, and calendar days for jump to
 * date.
 */
import { useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query';
import { dbClient, type SearchQueryInput } from '../../client/db-client';
import type { ChatId } from '../../core/ids';
import type { LocalDateTime } from '../../core/model';
import { SEARCH } from '../config';
import { queryKeys } from './keys';

/** Search filters without paging. */
export type SearchFilters = Omit<SearchQueryInput, 'limit' | 'cursor'>;

/** True when the query can run: full-text needs 3+ characters, and the
 * 1–2 character fallback only works inside one chat (§11). */
export function canSearch(filters: Pick<SearchFilters, 'query' | 'chatId'>): boolean {
  const length = filters.query.length;
  return length >= SEARCH.MIN_FULL_TEXT_LENGTH || (length > 0 && filters.chatId !== null);
}

/** Paged search results; the short-query fallback stops at its cap. */
export function useSearchResults(filters: SearchFilters) {
  const isShort = filters.query.length < SEARCH.MIN_FULL_TEXT_LENGTH;
  return useInfiniteQuery({
    queryKey: queryKeys.search(filters),
    queryFn: ({ pageParam }) =>
      dbClient.search({ ...filters, limit: SEARCH.PAGE_SIZE, cursor: pageParam }),
    initialPageParam: null as SearchQueryInput['cursor'],
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((sum, page) => sum + page.hits.length, 0);
      return isShort && loaded >= SEARCH.SHORT_QUERY_RESULT_CAP
        ? undefined
        : (last.nextCursor ?? undefined);
    },
    enabled: canSearch(filters),
  });
}

/** Every matching seq of an in-chat search, ascending (§11 "12 of 87"). */
export function useInChatMatches(chatId: ChatId, query: string) {
  return useQuery({
    queryKey: queryKeys.matches(chatId, query),
    queryFn: () =>
      dbClient.listMatchingSeqs({
        chatId,
        query,
        authorId: null,
        kinds: null,
        dateFromTsKey: null,
        dateToTsKey: null,
      }),
    enabled: query.length > 0,
  });
}

/** Day numbers that have messages (§12.5 jump to date). */
export function useMessageDays(chatId: ChatId, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.messageDays(chatId),
    queryFn: () => dbClient.listMessageDays(chatId),
    enabled,
  });
}

/** Resolves a date to the first seq at or after it (§12.5). */
export function useFindSeqByDate(chatId: ChatId) {
  return useMutation({
    mutationFn: (date: LocalDateTime) => dbClient.findSeqByDate(chatId, date),
  });
}
