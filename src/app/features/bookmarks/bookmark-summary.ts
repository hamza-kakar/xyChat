/**
 * One-line description of a bookmarked message: its text,
 * or the kind's label when it has none.
 */
import { en } from '../../i18n/en';
import type { BookmarkViewItem } from '../../../client/db-client';

/** Text shown for a bookmarked message. */
export function bookmarkSummary(message: BookmarkViewItem['message']): string {
  if (message.kind === 'deleted') {
    return en.chatView.deleted;
  }
  if (message.kind === 'poll' && message.poll !== null) {
    return `${en.chatView.kindLabels.poll}: ${message.poll.question}`;
  }
  return message.body === '' ? en.chatView.kindLabels[message.kind] : message.body;
}

/** Longest summary repeated inside a control's accessible name. */
const LABEL_SUMMARY_LENGTH = 60;

/** The summary shortened for an accessible name. */
export function shortSummary(summary: string): string {
  return summary.length > LABEL_SUMMARY_LENGTH
    ? `${summary.slice(0, LABEL_SUMMARY_LENGTH)}\u2026`
    : summary;
}
