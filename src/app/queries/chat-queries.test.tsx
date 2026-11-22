import { renderHook } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { testQueryClient } from '../test/providers';
import { CHAT_ID } from '../test/fixtures';
import { useInvalidateImportedChat } from './chat-queries';
import { queryKeys } from './keys';

vi.mock('../../client/db-client', () => ({ dbClient: {} }));

describe('useInvalidateImportedChat', () => {
  it('refreshes the chat, its messages and both bookmark lists, and drops search results', async () => {
    const client = testQueryClient();
    client.setQueryData(queryKeys.matches(CHAT_ID, 'trip'), { seqs: [1], isCapped: false });
    client.setQueryData(
      queryKeys.search({
        query: 'trip',
        chatId: null,
        authorId: null,
        kinds: null,
        dateFromTsKey: null,
        dateToTsKey: null,
      }),
      { pages: [], pageParams: [] },
    );
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const wrapper = ({ children }: { readonly children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useInvalidateImportedChat(), { wrapper });
    await result.current(CHAT_ID);
    const keys = invalidate.mock.calls.map(([filters]) => filters?.queryKey);
    expect(keys).toEqual(
      expect.arrayContaining([
        queryKeys.chats(),
        queryKeys.chat(CHAT_ID),
        queryKeys.messages(CHAT_ID),
        queryKeys.messageDays(CHAT_ID),
        queryKeys.bookmarks(CHAT_ID),
        queryKeys.bookmarks(null),
      ]),
    );
    expect(client.getQueryData(queryKeys.matches(CHAT_ID, 'trip'))).toBeUndefined();
    expect(client.getQueryCache().findAll({ queryKey: queryKeys.searchAll() })).toHaveLength(0);
  });
});
