/**
 * Bookmark queries and mutations (AGENTS.md §12.5, §18.4). Every change
 * refreshes exactly two lists: the chat's and the all-chats one.
 */
import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { dbClient } from '../../client/db-client';
import type { ChatId } from '../../core/ids';
import { queryKeys } from './keys';

/** Bookmarks of one chat, or of every chat when null; newest first. */
export function useBookmarks(chatId: ChatId | null) {
  return useQuery({
    queryKey: queryKeys.bookmarks(chatId),
    queryFn: () => dbClient.listBookmarks(chatId),
  });
}

/** Invalidates the chat's bookmark list and the all-chats list. */
function useInvalidateBookmarks(): (chatId: ChatId) => Promise<void> {
  const client = useQueryClient();
  return useCallback(
    async (chatId: ChatId) => {
      await Promise.all([
        client.invalidateQueries({ queryKey: queryKeys.bookmarks(chatId), exact: true }),
        client.invalidateQueries({ queryKey: queryKeys.bookmarks(null), exact: true }),
      ]);
    },
    [client],
  );
}

/** Bookmarks a message (or replaces its note). */
export function useAddBookmark() {
  const invalidate = useInvalidateBookmarks();
  return useMutation({
    mutationFn: (input: {
      readonly chatId: ChatId;
      readonly messageRowId: number;
      readonly note: string | null;
    }) => dbClient.addBookmark(input.chatId, input.messageRowId, input.note),
    onSuccess: (_id, input) => invalidate(input.chatId),
  });
}

/** Changes a bookmark's note (null clears it). */
export function useUpdateBookmark() {
  const invalidate = useInvalidateBookmarks();
  return useMutation({
    mutationFn: (input: {
      readonly chatId: ChatId;
      readonly bookmarkId: string;
      readonly note: string | null;
    }) => dbClient.updateBookmark(input.bookmarkId, input.note),
    onSuccess: (_result, input) => invalidate(input.chatId),
  });
}

/** Removes a bookmark. */
export function useRemoveBookmark() {
  const invalidate = useInvalidateBookmarks();
  return useMutation({
    mutationFn: (input: { readonly chatId: ChatId; readonly bookmarkId: string }) =>
      dbClient.removeBookmark(input.bookmarkId),
    onSuccess: (_result, input) => invalidate(input.chatId),
  });
}
