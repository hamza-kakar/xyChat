/**
 * db.worker (AGENTS.md §3.2): owns the ONLY SQLite connection. Opens the
 * sahpool-backed database, runs boot rollback (§9.3), and serves repository
 * calls over Comlink. Every RPC wraps unexpected exceptions (§18.7).
 */
import * as Comlink from 'comlink';
import { openDatabase } from '../storage/sqlite/open';
import { SqliteChatRepository } from '../storage/sqlite/sqlite-repository';
import { commitImport, type ImportCommitInput } from '../storage/sqlite/import-commit';
import type { ChatId } from '../core/ids';
import type { DbApi, WorkerError } from './db-api';
import { attachmentFromRow } from '../storage/sqlite/rows';

let repository: SqliteChatRepository | null = null;

/** Serializes an unexpected exception into a WorkerError (§18.7). The
 * client-side sink logs it; the worker has no app imports (§3.2). */
function toWorkerError(error: unknown): WorkerError {
  return { code: 'INTERNAL', message: String(error).slice(0, 200) };
}

/** Asserts the repository exists; throws INTERNAL otherwise. */
function repo(): SqliteChatRepository {
  if (repository === null) {
    throw new Error('db.worker not ready');
  }
  return repository;
}

/** Wraps a repository call with INTERNAL serialization. */
function wrap<T>(fn: () => T): Promise<T> {
  try {
    return Promise.resolve(fn());
  } catch (error) {
    const workerError = toWorkerError(error);
    return Promise.reject(new Error(`${workerError.code}: ${workerError.message}`));
  }
}

const api: DbApi = {
  async ready() {
    try {
      const opened = await openDatabase();
      if (!opened.ok) {
        return {
          ok: false as const,
          error: { code: 'INTERNAL' as const, message: opened.error.code },
        };
      }
      repository = new SqliteChatRepository(opened.value);
      // §9.3 boot rollback: mark in_progress imports rolled_back (the client
      // logs the returned path count from the RPC result).
      void repository.rollbackInProgressImports();
      return { ok: true as const };
    } catch (error) {
      return { ok: false as const, error: toWorkerError(error) };
    }
  },

  listChats: () => wrap(() => repo().listChats()),
  getChat: (id) => wrap(() => repo().getChat(id)),
  getParticipants: (chatId) => wrap(() => repo().getParticipants(chatId)),
  getMessageWindow: (q) => wrap(() => repo().getMessageWindow(q)),
  findSeqByDate: (chatId: ChatId, tsKey: number) => wrap(() => repo().findSeqByDate(chatId, tsKey)),
  search: (q) => wrap(() => repo().search(q)),
  listAttachments: (q) => wrap(() => repo().listAttachments(q)),
  listLinks: (q) => wrap(() => repo().listLinks(q)),
  getChatStats: (chatId) => wrap(() => repo().getChatStats(chatId)),
  setSelf: (chatId, participantId) =>
    wrap(() => {
      repo().setSelf(chatId, participantId);
    }),
  renameChat: (chatId, title) =>
    wrap(() => {
      repo().renameChat(chatId, title);
    }),
  deleteChat: (chatId) =>
    wrap(() => {
      const attachments = repo().database.selectObjects(
        'SELECT opfs_path, thumb_path FROM attachments WHERE chat_id = ?',
        [chatId],
      );
      const paths: string[] = [];
      for (const row of attachments) {
        for (const col of ['opfs_path', 'thumb_path']) {
          const value = row[col];
          if (typeof value === 'string' && value !== '') {
            paths.push(value);
          }
        }
      }
      repo().deleteChat(chatId);
      return paths;
    }),
  addBookmark: (chatId, messageId, note) => wrap(() => repo().addBookmark(chatId, messageId, note)),
  updateBookmark: (id, note) =>
    wrap(() => {
      repo().updateBookmark(id, note);
    }),
  removeBookmark: (id) =>
    wrap(() => {
      repo().removeBookmark(id);
    }),
  listBookmarks: (chatId) => wrap(() => repo().listBookmarks(chatId)),
  listImports: (chatId) => wrap(() => repo().listImports(chatId)),
  storageUsage: () => wrap(() => repo().storageUsage()),
  commitImport: (input: ImportCommitInput) => wrap(() => commitImport(repo().database, input)),
  recordWrittenPaths: (importId: string, paths: readonly string[]) =>
    wrap(() => {
      repo().database.run('UPDATE imports SET written_paths_json = ? WHERE id = ?', [
        JSON.stringify(paths),
        importId,
      ]);
    }),
  rollbackInProgressImports: () => wrap(() => repo().rollbackInProgressImports()),
  getAttachmentsForMessage: (messageId: number) =>
    wrap(() => {
      const rows = repo().database.selectObjects(
        'SELECT * FROM attachments WHERE message_id = ? ORDER BY id',
        [messageId],
      );
      return rows.map(attachmentFromRow);
    }),
};

// Expose the API. Comlink's expose returns void; the worker stays alive
// serving messages until terminated.
Comlink.expose(api, self);
