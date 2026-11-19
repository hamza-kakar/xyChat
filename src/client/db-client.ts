/**
 * Typed db.worker client (AGENTS.md §3.1): spawns the worker, wraps it in
 * Comlink, and forwards calls. Components never touch this directly — they
 * go through TanStack Query hooks. The client logs worker failures through
 * the app logger (§18.7 worker sink semantics).
 */
import * as Comlink from 'comlink';
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
export function ensureDbReady(): Promise<boolean> {
  readyPromise ??= (async (): Promise<boolean> => {
    const result = await remote().ready();
    // §9.3 boot rollback (incl. file deletion) completed in the worker.
    return result.ok;
  })();
  return readyPromise;
}

const RPC_TIMEOUT_MS = 10_000;
const RPC_TIMEOUT_EXEMPT = new Set(['commitImport']);

let diagnosticCounter = 0;

/** Forwards a call to the worker with a timeout (§18.8) and diagnostic id
 * (§18.7): timeouts and INTERNAL failures carry a stable id the user can
 * quote from the Diagnostics screen. */
async function call<T>(fn: (api: DbApi) => Promise<T>, method = 'unknown'): Promise<T> {
  const ok = await ensureDbReady();
  if (!ok) {
    throw new Error('INTERNAL: database unavailable (unsupported browser or open failure)');
  }
  const diagnosticId = `${Date.now().toString(36)}-${(diagnosticCounter += 1).toString(36)}`;
  if (RPC_TIMEOUT_EXEMPT.has(method)) {
    // Long-running import commits are exempt from the RPC timeout (§18.8).
    try {
      return await fn(remote());
    } catch (error) {
      // §3.1: no app imports here — the caller logs the diagnostic id.
      throw new Error(
        `INTERNAL: ${method} failed (id ${diagnosticId}): ${String(error).slice(0, 120)}`,
        { cause: error },
      );
    }
  }
  return Promise.race([
    fn(remote()),
    new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`TIMEOUT: ${method} exceeded ${RPC_TIMEOUT_MS}ms (id ${diagnosticId})`));
      }, RPC_TIMEOUT_MS);
    }),
  ]);
}

/** The main-thread-facing db client. */
export const dbClient = {
  listChats: () => call((a) => a.listChats()),
  getChat: (id: Parameters<DbApi['getChat']>[0]) => call((a) => a.getChat(id)),
  getParticipants: (chatId: Parameters<DbApi['getParticipants']>[0]) =>
    call((a) => a.getParticipants(chatId)),
  getMessageWindow: (q: Parameters<DbApi['getMessageWindow']>[0]) =>
    call((a) => a.getMessageWindow(q)),
  findSeqByDate: (
    chatId: Parameters<DbApi['findSeqByDate']>[0],
    date: Parameters<DbApi['findSeqByDate']>[1],
  ) => call((a) => a.findSeqByDate(chatId, date)),
  search: (q: Parameters<DbApi['search']>[0]) => call((a) => a.search(q)),
  listAttachments: (q: Parameters<DbApi['listAttachments']>[0]) =>
    call((a) => a.listAttachments(q)),
  listLinks: (q: Parameters<DbApi['listLinks']>[0]) => call((a) => a.listLinks(q)),
  getChatStats: (chatId: Parameters<DbApi['getChatStats']>[0]) =>
    call((a) => a.getChatStats(chatId)),
  setSelf: (
    chatId: Parameters<DbApi['setSelf']>[0],
    participantId: Parameters<DbApi['setSelf']>[1],
  ) => call((a) => a.setSelf(chatId, participantId)),
  renameChat: (chatId: Parameters<DbApi['renameChat']>[0], title: string) =>
    call((a) => a.renameChat(chatId, title)),
  deleteChat: (chatId: Parameters<DbApi['deleteChat']>[0]) => call((a) => a.deleteChat(chatId)),
  addBookmark: (
    chatId: Parameters<DbApi['addBookmark']>[0],
    messageId: number,
    note: string | null,
  ) => call((a) => a.addBookmark(chatId, messageId, note)),
  updateBookmark: (id: string, note: string | null) => call((a) => a.updateBookmark(id, note)),
  removeBookmark: (id: string) => call((a) => a.removeBookmark(id)),
  listBookmarks: (chatId: Parameters<DbApi['listBookmarks']>[0]) =>
    call((a) => a.listBookmarks(chatId)),
  listImports: (chatId: Parameters<DbApi['listImports']>[0]) => call((a) => a.listImports(chatId)),
  storageUsage: () => call((a) => a.storageUsage()),
  createImportRecord: (input: Parameters<DbApi['createImportRecord']>[0]) =>
    call((a) => a.createImportRecord(input)),
  commitImport: (input: Parameters<DbApi['commitImport']>[0]) => call((a) => a.commitImport(input)),
  recordWrittenPaths: (importId: string, paths: readonly string[]) =>
    call((a) => a.recordWrittenPaths(importId, paths)),
  getAttachmentsForMessage: (messageId: number) =>
    call((a) => a.getAttachmentsForMessage(messageId)),
};

/** Test seam: resets the cached worker (contract tests spawn their own). */
export function resetDbClientForTests(): void {
  worker?.terminate();
  worker = null;
  api = null;
  readyPromise = null;
}
