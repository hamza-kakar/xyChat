/**
 * Chat queries and mutations (AGENTS.md §18.4): the only way screens read
 * or change chats. Mutations invalidate exact keys.
 */
import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { dbClient } from '../../client/db-client';
import type { ChatId, ParticipantId } from '../../core/ids';
import { queryKeys } from './keys';

/** §12.4 chat-list rows, newest activity first (sorted in SQL). */
export function useChats() {
  return useQuery({ queryKey: queryKeys.chats(), queryFn: () => dbClient.listChats() });
}

/** One full chat, or null when it doesn't exist. */
export function useChat(chatId: ChatId) {
  return useQuery({ queryKey: queryKeys.chat(chatId), queryFn: () => dbClient.getChat(chatId) });
}

/** A chat's participants with palette indexes. */
export function useParticipants(chatId: ChatId) {
  return useQuery({
    queryKey: queryKeys.participants(chatId),
    queryFn: () => dbClient.getParticipants(chatId),
  });
}

/** A chat's import runs (message info names the import). */
export function useImports(chatId: ChatId, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.imports(chatId),
    queryFn: () => dbClient.listImports(chatId),
    enabled,
  });
}

/** Renames a chat; refreshes the list and the chat. */
export function useRenameChat() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { readonly chatId: ChatId; readonly title: string }) =>
      dbClient.renameChat(input.chatId, input.title),
    onSuccess: async (_result, input) => {
      await Promise.all([
        client.invalidateQueries({ queryKey: queryKeys.chats(), exact: true }),
        client.invalidateQueries({ queryKey: queryKeys.chat(input.chatId), exact: true }),
      ]);
    },
  });
}

/** Deletes a chat with its media; drops every cached query of that chat. */
export function useDeleteChat() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (chatId: ChatId) => dbClient.deleteChat(chatId),
    onSuccess: async (_paths, chatId) => {
      client.removeQueries({ queryKey: queryKeys.chat(chatId), exact: true });
      client.removeQueries({ queryKey: queryKeys.participants(chatId), exact: true });
      client.removeQueries({ queryKey: queryKeys.imports(chatId), exact: true });
      client.removeQueries({ queryKey: queryKeys.messages(chatId) });
      client.removeQueries({ queryKey: queryKeys.messageDays(chatId), exact: true });
      client.removeQueries({ queryKey: queryKeys.bookmarks(chatId), exact: true });
      client.removeQueries({ queryKey: queryKeys.matchesOfChat(chatId) });
      // Results may include the deleted chat's hits.
      client.removeQueries({ queryKey: queryKeys.searchAll() });
      await Promise.all([
        client.invalidateQueries({ queryKey: queryKeys.bookmarks(null), exact: true }),
        client.invalidateQueries({ queryKey: queryKeys.chats(), exact: true }),
        client.invalidateQueries({ queryKey: queryKeys.lastChatPosition(), exact: true }),
      ]);
    },
  });
}

/** Refreshes everything cached about a chat after an import changed it. */
export function useInvalidateImportedChat(): (chatId: ChatId) => Promise<void> {
  const client = useQueryClient();
  return useCallback(
    async (chatId: ChatId) => {
      await Promise.all([
        client.invalidateQueries({ queryKey: queryKeys.chats(), exact: true }),
        client.invalidateQueries({ queryKey: queryKeys.chat(chatId), exact: true }),
        client.invalidateQueries({ queryKey: queryKeys.participants(chatId), exact: true }),
        client.invalidateQueries({ queryKey: queryKeys.imports(chatId), exact: true }),
        client.invalidateQueries({ queryKey: queryKeys.messages(chatId) }),
        client.invalidateQueries({ queryKey: queryKeys.messageDays(chatId), exact: true }),
      ]);
      // New messages change every result list of this chat and the
      // global ones; drop them rather than refetch lists nobody shows.
      client.removeQueries({ queryKey: queryKeys.matchesOfChat(chatId) });
      client.removeQueries({ queryKey: queryKeys.searchAll() });
    },
    [client],
  );
}

/** Sets (or clears) which participant is "me" (§12.5). */
export function useSetSelf() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      readonly chatId: ChatId;
      readonly participantId: ParticipantId | null;
    }) => dbClient.setSelf(input.chatId, input.participantId),
    onSuccess: async (_result, input) => {
      await client.invalidateQueries({ queryKey: queryKeys.chat(input.chatId), exact: true });
    },
  });
}

/** The last opened chat and its top-visible seq (§12.5). */
export function useLastChatPosition() {
  return useQuery({
    queryKey: queryKeys.lastChatPosition(),
    queryFn: () => dbClient.getLastChatPosition(),
  });
}

/** Remembers the open chat's position. The cached value is updated in
 * place, so returning in the same session reads it without a refetch. */
export function useSaveChatPosition() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { readonly chatId: ChatId; readonly seq: number }) =>
      dbClient.setLastChatPosition(input.chatId, input.seq),
    onMutate: (input) => {
      client.setQueryData(queryKeys.lastChatPosition(), input);
    },
  });
}
