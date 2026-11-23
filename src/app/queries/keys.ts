/**
 * Central query-key factory. Every TanStack Query key
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
  /** Chat-info statistics. */
  chatStats: (chatId: string) => ['chat-stats', chatId] as const,
  /** All message blocks of one chat (prefix for invalidation). */
  messages: (chatId: string) => ['messages', chatId] as const,
  messageBlock: (chatId: string, block: number) => ['messages', chatId, block] as const,
  contactName: (messageRowId: number) => ['contact-name', messageRowId] as const,
  lastChatPosition: () => ['last-chat-position'] as const,
  /** Every search result list (prefix for invalidation). */
  searchAll: () => ['search'] as const,
  /** Global or filtered search pages. */
  search: (params: SearchParamsKey) => ['search', params] as const,
  /** Every in-chat match list of one chat (prefix for invalidation). */
  matchesOfChat: (chatId: string) => ['matches', chatId] as const,
  /** Every matching seq of an in-chat search. */
  matches: (chatId: string, query: string) => ['matches', chatId, query] as const,
  messageDays: (chatId: string) => ['message-days', chatId] as const,
  /** Every gallery and link list of one chat (prefix for invalidation). */
  mediaOfChat: (chatId: string) => ['media', chatId] as const,
  /** Gallery pages of one tab's media types. */
  gallery: (chatId: string, types: readonly string[]) =>
    ['media', chatId, 'gallery', types] as const,
  /** Link-bearing messages of one chat. */
  links: (chatId: string) => ['media', chatId, 'links'] as const,
  /** Bookmarks of one chat, or of all chats (`null`). */
  bookmarks: (chatId: string | null) => ['bookmarks', chatId] as const,
  /** App-lock state. */
  lockState: () => ['lock-state'] as const,
  /** Media bytes per chat. */
  storageUsage: () => ['storage-usage'] as const,
  /** The browser's usage/quota estimate. */
  storageEstimate: () => ['storage-estimate'] as const,
  /** Whether storage is persistent. */
  storagePersisted: () => ['storage-persisted'] as const,
  schemaVersion: () => ['schema-version'] as const,
  capabilities: () => ['capabilities'] as const,
  licenses: () => ['licenses'] as const,
  /** A finished backup archive in OPFS. */
  backupFile: (path: string) => ['backup-file', path] as const,
  /** Every backup-size estimate (prefix for invalidation). */
  backupEstimates: () => ['backup-estimate'] as const,
  /** The estimated size of one backup choice. */
  backupEstimate: (chatId: string | null, includeMedia: boolean) =>
    ['backup-estimate', chatId, includeMedia] as const,
};
