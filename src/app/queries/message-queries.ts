/**
 * Message queries. The chat view addresses
 * messages by seq and loads them in fixed blocks of MESSAGE_BLOCK_SIZE, so
 * any scroll position needs at most a few cached blocks and prepending
 * never shifts the list.
 */
import { useQueries, useQuery } from '@tanstack/react-query';
import { dbClient, type WindowMessage } from '../../client/db-client';
import type { ChatId } from '../../core/ids';
import { queryKeys } from './keys';

/** Messages per block (windows of 300). */
export const MESSAGE_BLOCK_SIZE = 300;

/** Block numbers covering seqs `from..to` (inclusive, clamped at 0). */
export function blocksForRange(from: number, to: number): readonly number[] {
  if (to < from || to < 0) {
    return [];
  }
  const first = Math.floor(Math.max(0, from) / MESSAGE_BLOCK_SIZE);
  const last = Math.floor(to / MESSAGE_BLOCK_SIZE);
  return Array.from({ length: last - first + 1 }, (_unused, index) => first + index);
}

/** Loaded messages by seq, plus whether any requested block is loading
 * or failed. */
export interface MessageBlocks {
  readonly bySeq: ReadonlyMap<number, WindowMessage>;
  readonly isError: boolean;
}

/** Loads the given blocks of a chat and merges them by seq. */
export function useMessageBlocks(chatId: ChatId, blocks: readonly number[]): MessageBlocks {
  return useQueries({
    queries: blocks.map((block) => ({
      queryKey: queryKeys.messageBlock(chatId, block),
      queryFn: () =>
        dbClient.getMessageWindow({
          chatId,
          anchorSeq: block * MESSAGE_BLOCK_SIZE,
          before: 0,
          after: MESSAGE_BLOCK_SIZE - 1,
        }),
    })),
    combine: combineBlocks,
  });
}

/** Module-level so TanStack Query keeps the combined value stable until a
 * block result actually changes. */
function combineBlocks(
  results: readonly {
    readonly data?: { readonly messages: readonly WindowMessage[] } | undefined;
    readonly isError: boolean;
  }[],
): MessageBlocks {
  const bySeq = new Map<number, WindowMessage>();
  for (const result of results) {
    for (const message of result.data?.messages ?? []) {
      bySeq.set(message.seq, message);
    }
  }
  return { bySeq, isError: results.some((result) => result.isError) };
}

/** The name on a message's contact card, read in the worker. */
export function useContactName(messageRowId: number, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.contactName(messageRowId),
    queryFn: () => dbClient.readContactName(messageRowId),
    enabled,
  });
}
