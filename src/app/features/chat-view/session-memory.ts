/**
 * Per-session chat-view stores (AGENTS.md §12.5). Kept in memory while the
 * app runs: the top-visible seq per chat (so returning restores the place;
 * the last chat's position also goes to `meta`), and which chats had the
 * "choose which person is you" banner dismissed.
 */
const topSeqByChat = new Map<string, number>();
const dismissedSelfBanners = new Set<string>();

/** Top-visible seq per chat. */
export const scrollMemory = {
  get: (chatId: string): number | undefined => topSeqByChat.get(chatId),
  set: (chatId: string, seq: number): void => {
    topSeqByChat.set(chatId, seq);
  },
};

/** Chats whose self-choice banner was dismissed this session. */
export const selfBannerMemory = {
  isDismissed: (chatId: string): boolean => dismissedSelfBanners.has(chatId),
  dismiss: (chatId: string): void => {
    dismissedSelfBanners.add(chatId);
  },
};
