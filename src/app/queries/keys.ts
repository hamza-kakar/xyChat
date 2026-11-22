/**
 * Central query-key factory (AGENTS.md §18.4). Every TanStack Query key
 * comes from here, so mutations invalidate exact keys instead of
 * refetching everything.
 */
/** The serializable search parameters that identify a result list. */
export interface SearchParamsKey {
  readonly query: string;
  readonly chatId: string | null;
  readonly authorId: string | null;
  readonly kinds: readonly string[] | null;
  readonly dateFromTsKey: number | null;
  readonly dateToTsKey: number | null;
}

export const queryKeys = {
  chats: () => ['chats'] as const,
  chat: (chatId: string) => ['chat', chatId] as const,
  participants: (chatId: string) => ['participants', chatId] as const,
  imports: (chatId: string) => ['imports', chatId] as const,
  /** All message blocks of one chat (prefix for invalidation). */
  messages: (chatId: string) => ['messages', chatId] as const,
  messageBlock: (chatId: string, block: number) => ['messages', chatId, block] as const,
  contactName: (messageRowId: number) => ['contact-name', messageRowId] as const,
  lastChatPosition: () => ['last-chat-position'] as const,
  /** Every search result list (prefix for invalidation). */
  searchAll: () => ['search'] as const,
  /** Global or filtered search pages (§11). */
  search: (params: SearchParamsKey) => ['search', params] as const,
  /** Every in-chat match list of one chat (prefix for invalidation). */
  matchesOfChat: (chatId: string) => ['matches', chatId] as const,
  /** Every matching seq of an in-chat search (§11). */
  matches: (chatId: string, query: string) => ['matches', chatId, query] as const,
  messageDays: (chatId: string) => ['message-days', chatId] as const,
  /** Bookmarks of one chat, or of all chats (`null`). */
  bookmarks: (chatId: string | null) => ['bookmarks', chatId] as const,
};
