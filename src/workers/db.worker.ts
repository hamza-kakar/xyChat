/**
 * db.worker (AGENTS.md §3.2): owns the ONLY SQLite connection. Opens the
 * sahpool-backed database, runs boot rollback (§9.3), and serves repository
 * calls over Comlink. Every RPC wraps unexpected exceptions (§18.7).
 */
import * as Comlink from 'comlink';
import { openDatabase } from '../storage/sqlite/open';
import { SqliteChatRepository } from '../storage/sqlite/sqlite-repository';
import { commitImport } from '../storage/sqlite/import-commit';
import { createImportRecord } from '../storage/sqlite/import-record';
import { deleteMediaFile } from '../storage/media-store';
import type { DbApi, WorkerError } from './db-api';
import { RpcValidationError, rpcInput } from './rpc-validate';
import { attachmentFromRow } from '../storage/sqlite/rows';

/** A message on the commit port (§3.2). */
type CommitPortMessage =
  | { readonly type: 'commit'; readonly requestId: number; readonly input: unknown }
  | {
      readonly type: 'written-paths';
      readonly requestId: number;
      readonly importId: string;
      readonly paths: readonly string[];
    };

let repository: SqliteChatRepository | null = null;

/** Serializes an unexpected exception into a WorkerError (§18.7). The stack
 * is preserved so the client-side diagnostics can quote it; it contains
 * engine locations only, never message content (§15.4). */
function toWorkerError(error: unknown, code: WorkerError['code'] = 'INTERNAL'): WorkerError {
  return {
    code,
    message: String(error).slice(0, 200),
    stack:
      error instanceof Error && typeof error.stack === 'string' ? error.stack.slice(0, 800) : null,
  };
}

/** Asserts the repository exists; throws INTERNAL otherwise. */
function repo(): SqliteChatRepository {
  if (repository === null) {
    throw new Error('db.worker not ready');
  }
  return repository;
}

/** Wraps a repository call: validation failures answer INVALID_INPUT (§18.5),
 * everything else serializes as INTERNAL with the worker-side stack. The
 * stack rides in the thrown message because Comlink re-creates Errors with
 * the message only (§18.7). */
function wrap<T>(fn: () => T): Promise<T> {
  return Promise.resolve()
    .then(fn)
    .catch((error: unknown) => {
      const code = error instanceof RpcValidationError ? 'INVALID_INPUT' : 'INTERNAL';
      const workerError = toWorkerError(error, code);
      const frames =
        workerError.stack !== null ? workerError.stack.split('\n').slice(0, 4).join(' | ') : '';
      const detail = frames === '' ? workerError.message : `${workerError.message} | ${frames}`;
      return Promise.reject(new Error(`${workerError.code}: ${detail}`));
    });
}

const api: DbApi = {
  async ready() {
    try {
      const opened = await openDatabase();
      if (!opened.ok) {
        return {
          ok: false as const,
          error: { code: 'INTERNAL' as const, message: opened.error.code, stack: null },
        };
      }
      repository = new SqliteChatRepository(opened.value);
      // §9.3 boot rollback: mark in_progress imports rolled_back and return
      // their written OPFS paths — the client deletes the files.
      const orphanPaths = repository.rollbackInProgressImports();
      // §9.3: the worker deletes the crashed import's files itself (workers
      // may import storage per §3.1); the client only logs the count.
      for (const path of orphanPaths) {
        await deleteMediaFile(path);
      }
      return { ok: true as const };
    } catch (error) {
      return { ok: false as const, error: toWorkerError(error) };
    }
  },

  listChats: () => wrap(() => repo().listChats()),
  getChat: (id) => wrap(() => repo().getChat(rpcInput.chatId('getChat', id))),
  getParticipants: (chatId) =>
    wrap(() => repo().getParticipants(rpcInput.chatId('getParticipants', chatId))),
  getMessageWindow: (q) =>
    wrap(() => {
      const input = rpcInput.messageWindow('getMessageWindow', q);
      return repo().getMessageWindow(input);
    }),
  findSeqByDate: (chatId, date) =>
    wrap(() => {
      const id = rpcInput.chatId('findSeqByDate', chatId);
      const local = rpcInput.localDateTime('findSeqByDate', date);
      return repo().findSeqByDate(id, local);
    }),
  search: (q) => wrap(() => repo().search(rpcInput.search('search', q))),
  listAttachments: (q) =>
    wrap(() => repo().listAttachments(rpcInput.attachments('listAttachments', q))),
  listLinks: (q) => wrap(() => repo().listLinks(rpcInput.links('listLinks', q))),
  getChatStats: (chatId) =>
    wrap(() => repo().getChatStats(rpcInput.chatId('getChatStats', chatId))),
  setSelf: (chatId, participantId) =>
    wrap(() => {
      const id = rpcInput.chatId('setSelf', chatId);
      const self = rpcInput.participantId('setSelf', participantId);
      repo().setSelf(id, self);
    }),
  renameChat: (chatId, title) =>
    wrap(() => {
      repo().renameChat(rpcInput.chatId('renameChat', chatId), rpcInput.title('renameChat', title));
    }),
  deleteChat: (chatId) =>
    wrap(() => {
      const id = rpcInput.chatId('deleteChat', chatId);
      const attachments = repo().database.selectObjects(
        'SELECT opfs_path, thumb_path FROM attachments WHERE chat_id = ?',
        [id],
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
      repo().deleteChat(id);
      return paths;
    }),
  addBookmark: (chatId, messageId, note) =>
    wrap(() => {
      const id = rpcInput.chatId('addBookmark', chatId);
      const rowId = rpcInput.nonNegativeInt('addBookmark', messageId);
      const parsedNote = rpcInput.bookmarkNote('addBookmark', note);
      return repo().addBookmark(id, rowId, parsedNote);
    }),
  updateBookmark: (id, note) =>
    wrap(() => {
      const bookmarkId = rpcInput.id('updateBookmark', id);
      const parsedNote = rpcInput.bookmarkNote('updateBookmark', note);
      repo().updateBookmark(bookmarkId, parsedNote);
    }),
  removeBookmark: (id) =>
    wrap(() => {
      repo().removeBookmark(rpcInput.id('removeBookmark', id));
    }),
  listBookmarks: (chatId) =>
    wrap(() => {
      const id = chatId === null ? null : rpcInput.chatId('listBookmarks', chatId);
      return repo().listBookmarks(id);
    }),
  listImports: (chatId) => wrap(() => repo().listImports(rpcInput.chatId('listImports', chatId))),
  storageUsage: () => wrap(() => repo().storageUsage()),
  createImportRecord: (input) =>
    wrap(() => {
      createImportRecord(repo().database, rpcInput.importRecord('createImportRecord', input));
    }),
  commitImport: (input) =>
    wrap(() => commitImport(repo().database, rpcInput.commitImport('commitImport', input))),
  recordWrittenPaths: (importId, paths) =>
    wrap(() => {
      const id = rpcInput.id('recordWrittenPaths', importId);
      const validated = rpcInput.writtenPaths('recordWrittenPaths', paths);
      repo().database.run('UPDATE imports SET written_paths_json = ? WHERE id = ?', [
        JSON.stringify(validated),
        id,
      ]);
    }),
  rollbackInProgressImports: () => wrap(() => repo().rollbackInProgressImports()),
  markImportCancelled: (importId) =>
    wrap(() => {
      repo().database.run(
        "UPDATE imports SET status = 'cancelled', finished_at = ? WHERE id = ? AND status = 'in_progress'",
        [
          new Date().toISOString().replace(/\.\d{3}Z$/u, 'Z'),
          rpcInput.id('markImportCancelled', importId),
        ],
      );
    }),
  markImportFailed: (importId) =>
    wrap(() => {
      repo().database.run(
        "UPDATE imports SET status = 'failed', finished_at = ? WHERE id = ? AND status = 'in_progress'",
        [
          new Date().toISOString().replace(/\.\d{3}Z$/u, 'Z'),
          rpcInput.id('markImportFailed', importId),
        ],
      );
    }),
  connectCommitPort: (port) => {
    // §3.2: the ONLY place beyond db.worker methods that executes commits.
    // Messages: { type: 'commit', requestId, input } and
    // { type: 'written-paths', requestId, importId, paths }.
    port.onmessage = (event: MessageEvent) => {
      const data = event.data as CommitPortMessage;
      if (data.type === 'commit') {
        try {
          const result = commitImport(repo().database, rpcInput.commitImport('commit', data.input));
          port.postMessage({ type: 'commit-result', requestId: data.requestId, result });
        } catch (error) {
          port.postMessage({
            type: 'commit-error',
            requestId: data.requestId,
            detail: String(error).slice(0, 200),
          });
        }
        return;
      }
      repo().database.run('UPDATE imports SET written_paths_json = ? WHERE id = ?', [
        JSON.stringify(data.paths),
        data.importId,
      ]);
    };
    port.start();
  },
  getAttachmentsForMessage: (messageId) =>
    wrap(() => {
      const rowId = rpcInput.nonNegativeInt('getAttachmentsForMessage', messageId);
      const rows = repo().database.selectObjects(
        'SELECT * FROM attachments WHERE message_id = ? ORDER BY id',
        [rowId],
      );
      return rows.map(attachmentFromRow);
    }),
};

// Expose the API. Comlink's expose returns void; the worker stays alive
// serving messages until terminated.
Comlink.expose(api, self);
