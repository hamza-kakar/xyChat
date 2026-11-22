/**
 * Chat-list preview text (AGENTS.md §12.4): sender prefix in groups and a
 * media-type label for media; other kinds get a short label.
 */
import { en } from '../../i18n/en';
import { formatString } from '../../i18n/format-string';
import type { ChatSummaryView } from '../../../client/db-client';

/** The kind-specific part of the preview (no sender). */
function previewBody(chat: ChatSummaryView): string {
  const body = chat.lastMessagePreview ?? '';
  switch (chat.lastMessageKind) {
    case null:
      return en.chatList.preview.empty;
    case 'media': {
      const label = en.chatView.mediaLabels[chat.lastMediaType ?? 'other'];
      return body === '' ? label : `${label} · ${body}`;
    }
    case 'deleted':
      return en.chatList.preview.deleted;
    case 'location':
      return en.chatList.preview.location;
    case 'contact':
      return en.chatList.preview.contact;
    case 'poll':
      return en.chatList.preview.poll;
    case 'call':
      return body === '' ? en.chatList.preview.call : body;
    case 'text':
    case 'system':
      return body;
  }
}

/** Full preview line for a chat row. */
export function chatPreview(chat: ChatSummaryView): string {
  const body = previewBody(chat);
  const author = chat.lastAuthorName;
  return chat.isGroup && author !== null && chat.lastMessageKind !== 'system'
    ? formatString(en.chatList.preview.senderPrefix, { name: author }) + body
    : body;
}
