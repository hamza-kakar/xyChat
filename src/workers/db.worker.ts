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
import {
  deleteChatMedia,
  deleteMediaFile,
  listFilesUnder,
  readMediaFile,
} from '../storage/media-store';
import { getLastChatPosition, setLastChatPosition } from '../storage/sqlite/view-state';
import { readContactName } from '../storage/contact-card';
import { AUDIO_CACHE_DIR } from '../storage/audio-cache';
import { thumbPathFor } from '../storage/media-paths';
import { writeMediaFile } from './media-writer';
import { rpcMediaInput } from './rpc-validate-media';
import type { DbApi, WorkerError } from './db-api';
import { RpcValidationError, rpcInput } from './rpc-validate';
import { handleCommitMessage } from './commit-port';
import { rpcSettingsInput } from './rpc-validate-settings';
import {
  changePin,
  readLockState,
  setAutoLockMinutes,
  verifyPin,
  type PinDeps,
} from '../storage/sqlite/app-lock-store';
import { readPersistedLogs, writePersistedLogs } from '../storage/sqlite/persisted-logs';
import { readSchemaVersion } from '../storage/sqlite/meta';
import { derivePinHash, randomPinSalt } from '../platform/pin-hash';

/** Production crypto and clock for the app lock (§15.3). */
const pinDeps: PinDeps = { derive: derivePinHash, randomSalt: randomPinSalt, now: Date.now };

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
function wrap<T>(fn: () => T | Promise<T>): Promise<T> {
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
  listMatchingSeqs: (q) =>
    wrap(() => repo().listMatchingSeqs(rpcInput.inChatSearch('listMatchingSeqs', q))),
  listMessageDays: (chatId) =>
    wrap(() => repo().listMessageDays(rpcInput.chatId('listMessageDays', chatId))),
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
    wrap(async () => {
      const id = rpcInput.chatId('deleteChat', chatId);
      const paths = repo().listChatMediaPaths(id);
      repo().deleteChat(id);
      // §10.4: files go after the DB commit; a failure here leaves orphans
      // for the sweeper (§9.3), never rows pointing at missing files.
      await deleteChatMedia(id);
      // Decoded voice notes sit outside the chat folders (§13.2).
      await Promise.all(
        paths.filter((path) => path.startsWith(`${AUDIO_CACHE_DIR}/`)).map(deleteMediaFile),
      );
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
      repo().recordWrittenPaths(
        rpcInput.id('recordWrittenPaths', importId),
        rpcInput.writtenPaths('recordWrittenPaths', paths),
      );
    }),
  rollbackInProgressImports: () => wrap(() => repo().rollbackInProgressImports()),
  markImportCancelled: (importId) =>
    wrap(() => {
      repo().markImportCancelled(rpcInput.id('markImportCancelled', importId));
    }),
  markImportFailed: (importId) =>
    wrap(() => {
      repo().markImportFailed(rpcInput.id('markImportFailed', importId));
    }),
  listStoredFingerprints: (chatId) =>
    wrap(() => repo().listStoredFingerprints(rpcInput.chatId('listStoredFingerprints', chatId))),
  listOrphanMedia: () =>
    wrap(async () => {
      const [media, thumbs, audio] = await Promise.all([
        listFilesUnder('media'),
        listFilesUnder('thumbs'),
        listFilesUnder(AUDIO_CACHE_DIR),
      ]);
      return repo().listOrphanMedia([...media, ...thumbs, ...audio]);
    }),
  deleteOrphanMedia: (paths) =>
    wrap(async () => {
      const validated = rpcInput.writtenPaths('deleteOrphanMedia', paths);
      const results = await Promise.all(validated.map(deleteMediaFile));
      return results.filter(Boolean).length;
    }),
  connectCommitPort: (port) => {
    // §3.2: the only place beyond db.worker methods that executes commits.
    // commit-port validates every message; anything but a commit is ignored.
    port.onmessage = (event: MessageEvent) => {
      const answer = handleCommitMessage(
        { commit: (input) => commitImport(repo().database, input) },
        event.data,
      );
      if (answer !== null) {
        port.postMessage(answer);
      }
    };
    port.start();
  },
  getAttachmentsForMessage: (messageId) =>
    wrap(() =>
      repo().getAttachmentsForMessage(
        rpcInput.nonNegativeInt('getAttachmentsForMessage', messageId),
      ),
    ),
  getLastChatPosition: () => wrap(() => getLastChatPosition(repo().database)),
  setLastChatPosition: (chatId, seq) =>
    wrap(() => {
      setLastChatPosition(repo().database, {
        chatId: rpcInput.chatId('setLastChatPosition', chatId),
        seq: rpcInput.nonNegativeInt('setLastChatPosition', seq),
      });
    }),
  readContactName: (messageId) =>
    wrap(() => {
      const rowId = rpcInput.nonNegativeInt('readContactName', messageId);
      return readContactName(repo().getAttachmentsForMessage(rowId), readMediaFile);
    }),
  setAttachmentDuration: (input) =>
    wrap(() => {
      const parsed = rpcMediaInput.duration('setAttachmentDuration', input);
      repo().setAttachmentDuration(parsed.attachmentId, parsed.durationMs);
    }),
  saveVideoThumbnail: (input) =>
    wrap(async () => {
      const parsed = rpcMediaInput.thumbnail('saveVideoThumbnail', input);
      const attachment = repo().getAttachment(parsed.attachmentId);
      if (attachment?.status !== 'present') {
        return null;
      }
      const path = thumbPathFor(attachment.chatId, attachment.id);
      const written = await writeMediaFile(path, parsed.jpeg);
      if (!written.ok) {
        return null;
      }
      const recorded = repo().setVideoThumbnail({
        attachmentId: attachment.id,
        thumbPath: path,
        width: parsed.width,
        height: parsed.height,
      });
      if (!recorded) {
        // Not a stored video: the file must not outlive the request.
        await deleteMediaFile(path);
        return null;
      }
      return path;
    }),
  getSchemaVersion: () => wrap(() => readSchemaVersion(repo().database)),
  getLockState: () => wrap(() => readLockState(repo().database, Date.now())),
  verifyPin: (pin) =>
    wrap(() => verifyPin(repo().database, rpcSettingsInput.pinAttempt('verifyPin', pin), pinDeps)),
  changePin: (input) =>
    wrap(() => changePin(repo().database, rpcSettingsInput.changePin('changePin', input), pinDeps)),
  setAutoLock: (minutes) =>
    wrap(() => {
      setAutoLockMinutes(repo().database, rpcSettingsInput.autoLockMinutes('setAutoLock', minutes));
    }),
  listPersistedLogs: () => wrap(() => readPersistedLogs(repo().database)),
  savePersistedLogs: (entries) =>
    wrap(() => {
      writePersistedLogs(repo().database, rpcSettingsInput.logs('savePersistedLogs', entries));
    }),
};

// Expose the API. Comlink's expose returns void; the worker stays alive
// serving messages until terminated.
Comlink.expose(api, self);
