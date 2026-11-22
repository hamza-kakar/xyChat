/**
 * Typed view-model fixtures for component tests (the shapes db.worker
 * returns). Synthetic data only.
 */
import {
  asAttachmentId,
  asBookmarkId,
  asChatId,
  asImportId,
  asMessageId,
  asParticipantId,
} from '../../core/ids';
import type {
  AttachmentView,
  BookmarkViewItem,
  ChatSummaryView,
  ChatView,
  ParticipantView,
  SearchHitView,
  WindowMessage,
} from '../../client/db-client';

export const CHAT_ID = asChatId('0f6c2b1e-1d2a-4c3b-9e8f-7a6b5c4d3e2f');

export function chatSummary(over: Partial<ChatSummaryView> = {}): ChatSummaryView {
  return {
    id: CHAT_ID,
    title: 'Family',
    isGroup: true,
    messageCount: 3,
    lastTsKey: Date.UTC(2026, 10, 17, 21, 22, 0) / 1000,
    lastMessagePreview: 'see you soon',
    lastMessageKind: 'text',
    lastAuthorName: 'Sara',
    lastMediaType: null,
    ...over,
  };
}

export function chat(over: Partial<ChatView> = {}): ChatView {
  return {
    id: CHAT_ID,
    title: 'Family',
    isGroup: true,
    selfParticipantId: null,
    sourcePlatform: 'ios',
    dateOrder: 'DMY',
    messageCount: 3,
    mediaCount: 1,
    mediaBytes: 2048,
    firstTsKey: null,
    lastTsKey: null,
    lastMessagePreview: null,
    createdAt: '2026-11-18T00:00:00Z',
    updatedAt: '2026-11-18T00:00:00Z',
    ...over,
  };
}

export const SARA = asParticipantId('p-sara');
export const ALI = asParticipantId('p-ali');

export function participant(over: Partial<ParticipantView> = {}): ParticipantView {
  return {
    id: SARA,
    chatId: CHAT_ID,
    displayName: 'Sara',
    colorIndex: 3,
    messageCount: 2,
    ...over,
  };
}

export function message(over: Partial<WindowMessage> = {}): WindowMessage {
  const seq = over.seq ?? 0;
  return {
    rowId: seq + 1,
    chatId: CHAT_ID,
    fingerprint: asMessageId(`fp-${String(seq)}`),
    seq,
    tsLocal: { year: 2026, month: 11, day: 17, hour: 21, minute: 19, second: 3 },
    tsKey: Date.UTC(2026, 10, 17, 21, 19, 3) / 1000,
    authorId: SARA,
    authorName: 'Sara',
    kind: 'text',
    body: 'hello there',
    isEdited: false,
    poll: null,
    location: null,
    importId: asImportId('imp-1'),
    attachments: [],
    ...over,
  };
}

export function attachment(over: Partial<AttachmentView> = {}): AttachmentView {
  return {
    id: asAttachmentId('att-1'),
    messageId: 1,
    chatId: CHAT_ID,
    fileName: 'IMG-0001.jpg',
    mediaType: 'image',
    mime: 'image/jpeg',
    byteSize: 2048,
    opfsPath: `media/${CHAT_ID}/att-1.jpg`,
    thumbPath: `thumbs/${CHAT_ID}/att-1.jpg`,
    width: 640,
    height: 480,
    durationMs: null,
    status: 'present',
    ...over,
  };
}

/** A bookmark joined with its message (bookmarks screen, chat view). */
export function bookmarkView(
  over: { readonly note?: string | null; readonly message?: Partial<WindowMessage> } = {},
): BookmarkViewItem {
  const full = message(over.message);
  const messageFields: BookmarkViewItem['message'] = {
    rowId: full.rowId,
    chatId: full.chatId,
    fingerprint: full.fingerprint,
    seq: full.seq,
    tsLocal: full.tsLocal,
    tsKey: full.tsKey,
    authorId: full.authorId,
    authorName: full.authorName,
    kind: full.kind,
    body: full.body,
    isEdited: full.isEdited,
    poll: full.poll,
    location: full.location,
    importId: full.importId,
  };
  return {
    bookmark: {
      id: asBookmarkId(`bm-${String(messageFields.seq)}`),
      chatId: messageFields.chatId,
      messageId: messageFields.rowId,
      note: over.note === undefined ? null : over.note,
      createdAt: '2026-11-19T00:00:00Z',
    },
    message: messageFields,
  };
}

/** A search hit (§11). */
export function searchHit(over: Partial<SearchHitView> = {}): SearchHitView {
  return {
    messageRowId: 5,
    chatId: CHAT_ID,
    seq: 4,
    tsLocal: { year: 2026, month: 11, day: 17, hour: 21, minute: 19, second: 3 },
    authorName: 'Sara',
    snippet: 'the trip starts on Monday',
    ...over,
  };
}
