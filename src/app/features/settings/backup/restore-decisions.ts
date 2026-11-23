/**
 * Restore choices (AGENTS.md §10.6): the defaults for a preview and the
 * decisions sent to the worker.
 */
import type { RestoreDecisionInput, RestorePreviewChatView } from '../../../../client/db-client';

/** One backup chat's choice. */
export type RestoreChoice = RestoreDecisionInput['choice'];

/** Choices keyed by backup chat id. */
export type ChoiceMap = ReadonlyMap<string, RestoreChoice>;

/** The safe defaults: merge into a matching chat, restore the rest. */
export function defaultChoices(chats: readonly RestorePreviewChatView[]): ChoiceMap {
  return new Map(chats.map((chat) => [chat.backupChatId, chat.match === null ? 'new' : 'merge']));
}

/** Turns the choices into the worker's decisions. */
export function toDecisions(
  chats: readonly RestorePreviewChatView[],
  choices: ChoiceMap,
): RestoreDecisionInput[] {
  return chats.map((chat) => {
    const choice = choices.get(chat.backupChatId) ?? 'skip';
    const targetChatId = choice === 'merge' || choice === 'replace' ? chat.match?.chatId : null;
    return { backupChatId: chat.backupChatId, choice, targetChatId: targetChatId ?? null };
  });
}
