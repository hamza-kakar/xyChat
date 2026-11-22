/**
 * Typed db.worker client (AGENTS.md §3.1): spawns the worker, wraps it in
 * Comlink, and forwards calls through the injectable RPC caller (§18.8).
 * Components never touch this directly — they go through TanStack Query
 * hooks. Every call names its method so timeouts, exemptions and diagnostic
 * ids are traceable (§18.7).
 */
import * as Comlink from 'comlink';
import { createRpcCaller, type RpcErrorSink } from './rpc-call';
import type { DbApi } from '../workers/db-api';

let worker: Worker | null = null;
let api: Comlink.Remote<DbApi> | null = null;
let readyPromise: Promise<boolean> | null = null;

/** Spawns the worker once and returns the remote API. */
function remote(): Comlink.Remote<DbApi> {
  if (api === null) {
    worker = new Worker(new URL('../workers/db.worker.ts', import.meta.url), {
      type: 'module',
    });
    api = Comlink.wrap<DbApi>(worker);
  }
  return api;
}

/**
 * Boots the db.worker: capabilities (incl. the FTS5 probe, ADR 0008),
 * migrations, boot rollback. Resolves false when the database cannot open —
 * the caller renders the unsupported screen with the failure reason.
 */
export async function ensureDbReady(): Promise<boolean> {
  readyPromise ??= (async (): Promise<boolean> => {
    const result = await remote().ready();
    // §9.3 boot rollback (incl. file deletion) completed in the worker.
    return result.ok;
  })();
  return readyPromise;
}

const RPC_TIMEOUT_MS = 10_000;
/** Long-running import commits are exempt from the RPC timeout (§18.8). */
const RPC_TIMEOUT_EXEMPT: ReadonlySet<string> = new Set(['commitImport']);

const caller = createRpcCaller({
  ensureReady: ensureDbReady,
  timeoutMs: RPC_TIMEOUT_MS,
  exempt: RPC_TIMEOUT_EXEMPT,
});

/** Registers the failure sink (logger-backed, from the app layer §3.1). */
export function setRpcErrorSink(sink: RpcErrorSink | null): void {
  caller.setSink(sink);
}

/** The main-thread-facing db client. Every RPC names its method (§18.8). */
export const dbClient = {
  listChats: () => caller.call(() => remote().listChats(), 'listChats'),
  getChat: (id: Parameters<DbApi['getChat']>[0]) =>
    caller.call(() => remote().getChat(id), 'getChat'),
  getParticipants: (chatId: Parameters<DbApi['getParticipants']>[0]) =>
    caller.call(() => remote().getParticipants(chatId), 'getParticipants'),
  getMessageWindow: (q: Parameters<DbApi['getMessageWindow']>[0]) =>
    caller.call(() => remote().getMessageWindow(q), 'getMessageWindow'),
  findSeqByDate: (
    chatId: Parameters<DbApi['findSeqByDate']>[0],
    date: Parameters<DbApi['findSeqByDate']>[1],
  ) => caller.call(() => remote().findSeqByDate(chatId, date), 'findSeqByDate'),
  search: (q: Parameters<DbApi['search']>[0]) => caller.call(() => remote().search(q), 'search'),
  listMatchingSeqs: (q: Parameters<DbApi['listMatchingSeqs']>[0]) =>
    caller.call(() => remote().listMatchingSeqs(q), 'listMatchingSeqs'),
  listMessageDays: (chatId: Parameters<DbApi['listMessageDays']>[0]) =>
    caller.call(() => remote().listMessageDays(chatId), 'listMessageDays'),
  listAttachments: (q: Parameters<DbApi['listAttachments']>[0]) =>
    caller.call(() => remote().listAttachments(q), 'listAttachments'),
  listLinks: (q: Parameters<DbApi['listLinks']>[0]) =>
    caller.call(() => remote().listLinks(q), 'listLinks'),
  getChatStats: (chatId: Parameters<DbApi['getChatStats']>[0]) =>
    caller.call(() => remote().getChatStats(chatId), 'getChatStats'),
  setSelf: (
    chatId: Parameters<DbApi['setSelf']>[0],
    participantId: Parameters<DbApi['setSelf']>[1],
  ) => caller.call(() => remote().setSelf(chatId, participantId), 'setSelf'),
  renameChat: (chatId: Parameters<DbApi['renameChat']>[0], title: string) =>
    caller.call(() => remote().renameChat(chatId, title), 'renameChat'),
  deleteChat: (chatId: Parameters<DbApi['deleteChat']>[0]) =>
    caller.call(() => remote().deleteChat(chatId), 'deleteChat'),
  addBookmark: (
    chatId: Parameters<DbApi['addBookmark']>[0],
    messageId: number,
    note: string | null,
  ) => caller.call(() => remote().addBookmark(chatId, messageId, note), 'addBookmark'),
  updateBookmark: (id: string, note: string | null) =>
    caller.call(() => remote().updateBookmark(id, note), 'updateBookmark'),
  removeBookmark: (id: string) => caller.call(() => remote().removeBookmark(id), 'removeBookmark'),
  listBookmarks: (chatId: Parameters<DbApi['listBookmarks']>[0]) =>
    caller.call(() => remote().listBookmarks(chatId), 'listBookmarks'),
  listImports: (chatId: Parameters<DbApi['listImports']>[0]) =>
    caller.call(() => remote().listImports(chatId), 'listImports'),
  storageUsage: () => caller.call(() => remote().storageUsage(), 'storageUsage'),
  createImportRecord: (input: Parameters<DbApi['createImportRecord']>[0]) =>
    caller.call(() => remote().createImportRecord(input), 'createImportRecord'),
  commitImport: (input: Parameters<DbApi['commitImport']>[0]) =>
    caller.call(() => remote().commitImport(input), 'commitImport'),
  recordWrittenPaths: (importId: string, paths: readonly string[]) =>
    caller.call(() => remote().recordWrittenPaths(importId, paths), 'recordWrittenPaths'),
  getAttachmentsForMessage: (messageId: number) =>
    caller.call(() => remote().getAttachmentsForMessage(messageId), 'getAttachmentsForMessage'),
  getLastChatPosition: () =>
    caller.call(() => remote().getLastChatPosition(), 'getLastChatPosition'),
  setLastChatPosition: (chatId: Parameters<DbApi['setLastChatPosition']>[0], seq: number) =>
    caller.call(() => remote().setLastChatPosition(chatId, seq), 'setLastChatPosition'),
  readContactName: (messageId: number) =>
    caller.call(() => remote().readContactName(messageId), 'readContactName'),
  setAttachmentDuration: (input: Parameters<DbApi['setAttachmentDuration']>[0]) =>
    caller.call(() => remote().setAttachmentDuration(input), 'setAttachmentDuration'),
  /** Saves a video thumbnail; the JPEG buffer is transferred (§9.4). */
  saveVideoThumbnail: (input: Parameters<DbApi['saveVideoThumbnail']>[0]) =>
    caller.call(
      () => remote().saveVideoThumbnail(Comlink.transfer(input, [input.jpeg.buffer])),
      'saveVideoThumbnail',
    ),
  markImportCancelled: (importId: string) =>
    caller.call(() => remote().markImportCancelled(importId), 'markImportCancelled'),
  markImportFailed: (importId: string) =>
    caller.call(() => remote().markImportFailed(importId), 'markImportFailed'),
  listStoredFingerprints: (chatId: string) =>
    caller.call(() => remote().listStoredFingerprints(chatId), 'listStoredFingerprints'),
  listOrphanMedia: () => caller.call(() => remote().listOrphanMedia(), 'listOrphanMedia'),
  deleteOrphanMedia: (paths: readonly string[]) =>
    caller.call(() => remote().deleteOrphanMedia(paths), 'deleteOrphanMedia'),
  /** Takes the db-side end of the commit MessageChannel (§3.2, transferred). */
  connectCommitPort: (port: MessagePort) =>
    caller.call(
      () => remote().connectCommitPort(Comlink.transfer(port, [port])),
      'connectCommitPort',
    ),
};

/** Chat-list row (§12.4), as served by the worker. */
export type ChatSummaryView = Awaited<ReturnType<DbApi['listChats']>>[number];
/** One full chat. */
export type ChatView = NonNullable<Awaited<ReturnType<DbApi['getChat']>>>;
/** A chat participant with its palette index. */
export type ParticipantView = Awaited<ReturnType<DbApi['getParticipants']>>[number];
/** A message window around an anchor seq (§12.5). */
export type MessageWindowView = Awaited<ReturnType<DbApi['getMessageWindow']>>;
/** One message with its attachments. */
export type WindowMessage = MessageWindowView['messages'][number];
/** One attachment row. */
export type AttachmentView = WindowMessage['attachments'][number];
/** One global search hit (§11). */
export type SearchHitView = Awaited<ReturnType<DbApi['search']>>['hits'][number];
/** A search query as the worker takes it. */
export type SearchQueryInput = Parameters<DbApi['search']>[0];
/** An in-chat navigation query (§11). */
export type InChatSearchInput = Parameters<DbApi['listMatchingSeqs']>[0];
/** One bookmark joined with its message. */
export type BookmarkViewItem = Awaited<ReturnType<DbApi['listBookmarks']>>[number];
/** One stored media file with its message context (§12.6). */
export type GalleryItemView = Awaited<ReturnType<DbApi['listAttachments']>>['items'][number];
/** A gallery page. */
export type GalleryPageView = Awaited<ReturnType<DbApi['listAttachments']>>;
/** One link-bearing message (§12.6 Links tab). */
export type LinkMessageView = Awaited<ReturnType<DbApi['listLinks']>>['messages'][number];
/** A links page. */
export type LinkPageView = Awaited<ReturnType<DbApi['listLinks']>>;
/** One import run (chat info, message info). */
export type ImportRecordView = Awaited<ReturnType<DbApi['listImports']>>[number];

/** Test seam: resets the cached worker (contract tests spawn their own). */
export function resetDbClientForTests(): void {
  worker?.terminate();
  worker = null;
  api = null;
  readyPromise = null;
}
