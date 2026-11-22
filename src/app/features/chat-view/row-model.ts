/**
 * Pure layout decisions for one chat row (AGENTS.md §12.5): day
 * separators, consecutive-run grouping, alignment, sender names and the
 * accessible label. Kept free of React so it is unit-tested directly.
 */
import { formatDateTime, isSameDay } from '../../../core/dates';
import { en } from '../../i18n/en';
import { formatString } from '../../i18n/format-string';
import type { WindowMessage } from '../../../client/db-client';

/** Bubbles by one author within this gap form a run (§12.5: 5 minutes). */
export const RUN_GAP_SECONDS = 300;

/** What the chat needs to know to lay out a row. */
export interface RowContext {
  readonly selfId: string | null;
  readonly isGroup: boolean;
  readonly locale: string;
}

/** Layout of one row. */
export interface RowLayout {
  readonly showDaySeparator: boolean;
  readonly isOutgoing: boolean;
  /** True for the first bubble of a run (gets the tail and wider spacing). */
  readonly isRunStart: boolean;
  readonly showSenderName: boolean;
}

/** True when `message` continues `prev`'s run: same author, same day,
 * neither is a system row, and at most RUN_GAP_SECONDS apart. */
export function continuesRun(prev: WindowMessage | undefined, message: WindowMessage): boolean {
  if (prev === undefined || prev.kind === 'system' || message.kind === 'system') {
    return false;
  }
  const gap = message.tsKey - prev.tsKey;
  return (
    message.authorId !== null &&
    prev.authorId === message.authorId &&
    gap >= 0 &&
    gap <= RUN_GAP_SECONDS &&
    isSameDay(prev.tsLocal, message.tsLocal)
  );
}

/**
 * Lays out a row from the message and the one before it.
 *
 * @param prev The previous message by seq; undefined for the first message
 *   (or while its block is still loading).
 */
export function layoutRow(
  prev: WindowMessage | undefined,
  message: WindowMessage,
  context: RowContext,
): RowLayout {
  const isOutgoing =
    context.selfId !== null && message.authorId !== null && message.authorId === context.selfId;
  const isRunStart = !continuesRun(prev, message);
  return {
    showDaySeparator: prev === undefined || !isSameDay(prev.tsLocal, message.tsLocal),
    isOutgoing,
    isRunStart,
    showSenderName: context.isGroup && !isOutgoing && isRunStart && message.authorName !== null,
  };
}

/** Short spoken description of a message's content (§16). */
export function describeContent(message: WindowMessage): string {
  const attachment = message.attachments[0];
  switch (message.kind) {
    case 'deleted':
      return en.chatView.deleted;
    case 'media': {
      const label = en.chatView.mediaLabels[attachment?.mediaType ?? 'other'];
      return message.body === '' ? label : `${label}, ${message.body}`;
    }
    case 'location':
      return message.location === null
        ? en.chatView.kindLabels.location
        : `${en.chatView.kindLabels.location}, ${formatString(en.chatView.coordinates, {
            lat: message.location.lat,
            lng: message.location.lng,
          })}`;
    case 'poll':
      return `${en.chatView.kindLabels.poll}, ${message.poll?.question ?? message.body}`;
    case 'contact':
      return en.chatView.kindLabels.contact;
    case 'text':
    case 'system':
    case 'call':
      return message.body;
  }
}

/** The accessible label: "{sender}, {date time}: {content}" (§16). */
export function messageLabel(message: WindowMessage, context: RowContext): string {
  return formatString(en.chatView.messageLabel, {
    sender: message.authorName ?? en.chatView.systemSender,
    time: formatDateTime(message.tsLocal, { locale: context.locale }),
    content: describeContent(message),
  });
}
