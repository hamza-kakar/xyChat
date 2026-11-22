/**
 * Central query-key factory (AGENTS.md §18.4). Every TanStack Query key
 * comes from here, so mutations invalidate exact keys instead of
 * refetching everything.
 */
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
};
