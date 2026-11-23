/**
 * Backup and restore runs end to end (§10.6): real sqlite-wasm and zip.js,
 * with an in-memory stand-in for OPFS (sync access handles exist only in
 * workers, ADR 0007).
 */
import * as zipJs from '@zip.js/zip.js';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { commitImport } from '../../src/storage/sqlite/import-commit';
import { createImportRecord } from '../../src/storage/sqlite/import-record';
import { loadSqlite, type SqliteDatabase } from '../../src/storage/sqlite/open';
import { createScratchDatabases, type ScratchDatabases } from '../../src/storage/sqlite/scratch-db';
import type { SqliteChatRepository } from '../../src/storage/sqlite/sqlite-repository';
import { asChatId } from '../../src/core/ids';
import { ok } from '../../src/core/result';
import { runBackup, type BackupRunDeps } from '../../src/workers/backup-run';
import { inspectBackup } from '../../src/workers/restore-inspect';
import { runRestore, type RestoreRunDeps } from '../../src/workers/restore-run';
import type { TransferHooks, TransferProgressEvent } from '../../src/workers/transfer-hooks';
import type { RestoreDecision } from '../../src/workers/transfer-types';
import type { ParsedMessage } from '../../src/core/model';
import { msg, openContractDb, recordInput, RUN_FACTS } from './contract-helpers';

let scratch: ScratchDatabases;
let db: SqliteDatabase;
let repo: SqliteChatRepository;
let files: Map<string, Uint8Array<ArrayBuffer>[]>;
let events: TransferProgressEvent[];
let cancelAfterEvents: number | null;

beforeAll(async () => {
  scratch = createScratchDatabases(await loadSqlite());
});

beforeEach(async () => {
  ({ db, repo } = await openContractDb());
  files = new Map();
  events = [];
  cancelAfterEvents = null;
});

afterEach(() => {
  db.close();
});

const hooks: TransferHooks = {
  onProgress: (event) => {
    events.push(event);
  },
  isCancelled: () => cancelAfterEvents !== null && events.length >= cancelAfterEvents,
};

const fileDeps = {
  openSink: (path: string) => {
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    files.set(path, chunks);
    return Promise.resolve(
      ok({
        write: (chunk: Uint8Array) => {
          chunks.push(chunk.slice());
          return Promise.resolve();
        },
        close: () => Promise.resolve(),
      }),
    );
  },
  readFile: (path: string) => {
    const chunks = files.get(path);
    return Promise.resolve(chunks === undefined ? null : new Blob(chunks));
  },
  deleteFile: (path: string) => Promise.resolve(files.delete(path)),
};

function backupDeps(): BackupRunDeps {
  return {
    ...fileDeps,
    db,
    scratch,
    clearBackupFiles: () => {
      for (const path of [...files.keys()].filter((p) => p.startsWith('backup-tmp/'))) {
        files.delete(path);
      }
      return Promise.resolve();
    },
    now: () => new Date(2026, 10, 23, 9, 5),
  };
}

function restoreDeps(free = Number.MAX_SAFE_INTEGER): RestoreRunDeps {
  return { ...fileDeps, repo, scratch, estimateFreeBytes: () => Promise.resolve(free) };
}

function fp(n: number): string {
  return n.toString(16).padStart(32, '0');
}

/** A chat with two texts and a stored photo (file and thumbnail in OPFS). */
function seedChat(chatId: string): void {
  createImportRecord(db, recordInput(`imp-${chatId}`));
  const photo: ParsedMessage = {
    ...msg(2, 'look', 2),
    kind: 'media',
    attachment: { fileName: 'IMG-1.jpg', mediaType: 'image', status: 'referenced' },
  };
  commitImport(db, {
    importId: `imp-${chatId}`,
    targetChatId: chatId,
    newChat: { title: 'Family', isGroup: false, sourcePlatform: 'ios', dateOrder: 'DMY' },
    messages: [
      { fingerprint: fp(1), message: msg(0, 'hello', 0) },
      { fingerprint: fp(2), message: msg(1, 'hi', 1, 'Ali Khan') },
      { fingerprint: fp(3), message: photo },
    ],
    attachments: [
      {
        id: `${chatId}-a1`,
        fingerprintOfMessage: fp(3),
        fileName: 'IMG-1.jpg',
        mediaType: 'image',
        mime: 'image/jpeg',
        byteSize: 3,
        opfsPath: `media/${chatId}/${chatId}-a1.jpg`,
        thumbPath: `thumbs/${chatId}/${chatId}-a1.jpg`,
        width: 4,
        height: 3,
        durationMs: null,
        status: 'present',
      },
    ],
    fileName: 'chat.zip',
    fileBytes: 10,
    parserVersion: '1.0.0',
    report: RUN_FACTS,
  });
  files.set(`media/${chatId}/${chatId}-a1.jpg`, [new Uint8Array([1, 2, 3])]);
  files.set(`thumbs/${chatId}/${chatId}-a1.jpg`, [new Uint8Array([9])]);
}

async function makeBackup(includeMedia = true): Promise<File> {
  const result = await runBackup(
    backupDeps(),
    { chatIds: null, includeMedia, appName: 'Chat Keep', appVersion: '1.0.0' },
    hooks,
  );
  if (!result.ok) {
    throw new Error(result.error.code);
  }
  expect(result.value.fileName).toBe('chatkeep-backup-20261123-0905.zip');
  const chunks = files.get(result.value.path) ?? [];
  return new File(chunks, result.value.fileName, { type: 'application/zip' });
}

function fingerprints(chatId: string): string[] {
  return db
    .selectArrays('SELECT fingerprint FROM messages WHERE chat_id = ? ORDER BY seq', [chatId])
    .map((row) => String(row[0]));
}

function mediaFileNames(chatId: string): string[] {
  return [...files.keys()].filter((path) => path.startsWith(`media/${chatId}/`));
}

async function zipOf(entries: Record<string, string>): Promise<File> {
  const writer = new zipJs.ZipWriter(new zipJs.BlobWriter(), { useWebWorkers: false });
  for (const [name, text] of Object.entries(entries)) {
    await writer.add(name, new zipJs.TextReader(text));
  }
  return new File([await writer.close()], 'x.zip');
}

const restoreAsNew = (backupChatId: string): RestoreDecision[] => [
  { backupChatId, choice: 'new', targetChatId: null },
];

describe('backup run', () => {
  it('writes the manifest, the snapshot and the media with progress', async () => {
    seedChat('chat-a');
    const file = await makeBackup();
    const reader = new zipJs.ZipReader(new zipJs.BlobReader(file), { useWebWorkers: false });
    const names = (await reader.getEntries()).map((entry) => entry.filename);
    await reader.close();
    expect(names).toEqual([
      'manifest.json',
      'db.sqlite3',
      'media/chat-a/chat-a-a1.jpg',
      'thumbs/chat-a/chat-a-a1.jpg',
    ]);
    expect(events.map((e) => e.phase)).toEqual(['snapshot', 'media', 'media', 'finishing']);
  });

  it('reports no chats and cancels cleanly', async () => {
    const empty = await runBackup(
      backupDeps(),
      { chatIds: null, includeMedia: true, appName: 'A', appVersion: '1' },
      hooks,
    );
    expect(empty.ok || empty.error.code).toBe('NO_CHATS');
    seedChat('chat-a');
    cancelAfterEvents = 1;
    const cancelled = await runBackup(
      backupDeps(),
      { chatIds: null, includeMedia: true, appName: 'A', appVersion: '1' },
      hooks,
    );
    expect(cancelled.ok || cancelled.error.code).toBe('CANCELLED');
    expect([...files.keys()].some((path) => path.startsWith('backup-tmp/'))).toBe(false);
  });
});

describe('restore run', () => {
  it('restores a deleted chat with identical fingerprints and media', async () => {
    seedChat('chat-a');
    const before = fingerprints('chat-a');
    const file = await makeBackup();
    repo.deleteChat(asChatId('chat-a'));
    files.delete('media/chat-a/chat-a-a1.jpg');
    files.delete('thumbs/chat-a/chat-a-a1.jpg');

    const preview = await inspectBackup({ db, scratch }, file);
    expect(preview.ok && preview.value.chats.map((c) => [c.title, c.match])).toEqual([
      ['Family', null],
    ]);
    const restored = await runRestore(
      restoreDeps(),
      { file, fileName: file.name, decisions: restoreAsNew('chat-a') },
      hooks,
    );
    expect(restored.ok && restored.value[0]).toMatchObject({
      chatId: 'chat-a',
      action: 'new',
      messagesAdded: 3,
      mediaRestored: 1,
    });
    expect(fingerprints('chat-a')).toEqual(before);
    const [path] = mediaFileNames('chat-a');
    expect(files.get(path ?? '')).toEqual([new Uint8Array([1, 2, 3])]);
    expect(repo.listImports(asChatId('chat-a'))[0]?.fileName).toBe(file.name);
  });

  it('merges into a matching chat without copying stored media', async () => {
    seedChat('chat-a');
    const file = await makeBackup();
    const preview = await inspectBackup({ db, scratch }, file);
    expect(preview.ok && preview.value.chats[0]?.match).toEqual({
      chatId: 'chat-a',
      title: 'Family',
    });
    const restored = await runRestore(
      restoreDeps(),
      {
        file,
        fileName: file.name,
        decisions: [{ backupChatId: 'chat-a', choice: 'merge', targetChatId: 'chat-a' }],
      },
      hooks,
    );
    expect(restored.ok && restored.value[0]).toMatchObject({
      messagesAdded: 0,
      duplicatesSkipped: 3,
      mediaRestored: 0,
      mediaMissing: 0,
    });
    expect(mediaFileNames('chat-a')).toEqual(['media/chat-a/chat-a-a1.jpg']);
  });
});

describe('restore run: replace and copy', () => {
  it('replaces a chat and removes its old files', async () => {
    seedChat('chat-a');
    const file = await makeBackup();
    const restored = await runRestore(
      restoreDeps(),
      {
        file,
        fileName: file.name,
        decisions: [{ backupChatId: 'chat-a', choice: 'replace', targetChatId: 'chat-a' }],
      },
      hooks,
    );
    expect(restored.ok && restored.value[0]?.messagesAdded).toBe(3);
    const paths = mediaFileNames('chat-a');
    expect(paths).toHaveLength(1);
    expect(paths[0]).not.toBe('media/chat-a/chat-a-a1.jpg');
  });

  it('restores a copy beside the original under a new id', async () => {
    seedChat('chat-a');
    const file = await makeBackup(false);
    const restored = await runRestore(
      restoreDeps(),
      { file, fileName: file.name, decisions: restoreAsNew('chat-a') },
      hooks,
    );
    if (!restored.ok) {
      throw new Error(restored.error.code);
    }
    const copy = restored.value[0];
    expect(copy?.chatId).not.toBe('chat-a');
    expect(copy?.mediaMissing).toBe(1);
    expect(fingerprints(copy?.chatId ?? '')).toEqual(fingerprints('chat-a'));
  });
});

describe('restore run: failures', () => {
  it('leaves nothing behind when cancelled', async () => {
    seedChat('chat-a');
    const file = await makeBackup();
    repo.deleteChat(asChatId('chat-a'));
    files.clear();
    events = [];
    cancelAfterEvents = 1;
    const restored = await runRestore(
      restoreDeps(),
      { file, fileName: file.name, decisions: restoreAsNew('chat-a') },
      hooks,
    );
    expect(restored.ok || restored.error.code).toBe('CANCELLED');
    expect(repo.listChats()).toHaveLength(0);
    expect([...files.keys()]).toEqual([]);
    const statuses = db.selectArrays('SELECT status FROM imports WHERE file_name = ?', [file.name]);
    expect(statuses).toEqual([['cancelled']]);
  });

  it('refuses bad choices and missing room', async () => {
    seedChat('chat-a');
    const file = await makeBackup();
    const run = (decisions: RestoreDecision[], free?: number) =>
      runRestore(restoreDeps(free), { file, fileName: file.name, decisions }, hooks);
    const skipped = await run([{ backupChatId: 'chat-a', choice: 'skip', targetChatId: null }]);
    expect(skipped.ok || skipped.error.code).toBe('NOTHING_TO_RESTORE');
    const noTarget = await run([{ backupChatId: 'chat-a', choice: 'merge', targetChatId: 'x' }]);
    expect(noTarget.ok || noTarget.error.code).toBe('TARGET_NOT_FOUND');
    const unknown = await run(restoreAsNew('not-in-backup'));
    expect(unknown.ok || unknown.error.code).toBe('CORRUPT_DATABASE');
    repo.deleteChat(asChatId('chat-a'));
    const full = await run(restoreAsNew('chat-a'), 0);
    expect(full.ok || full.error.code).toBe('QUOTA_EXCEEDED');
  });

  it('rejects files that are not usable backups', async () => {
    const codeOf = async (file: File): Promise<string> => {
      const result = await inspectBackup({ db, scratch }, file);
      return result.ok ? 'ok' : result.error.code;
    };
    expect(await codeOf(new File(['plain text'], 'a.zip'))).toBe('NOT_A_BACKUP');
    expect(await codeOf(await zipOf({ 'a.txt': 'x' }))).toBe('NOT_A_BACKUP');
    expect(await codeOf(await zipOf({ 'manifest.json': '{', 'db.sqlite3': 'x' }))).toBe(
      'INVALID_MANIFEST',
    );
    const manifest = (schemaVersion: number): string =>
      JSON.stringify({
        app: 'A',
        appVersion: '1',
        schemaVersion,
        createdAt: '2026-11-23T09:05:00.000Z',
        chats: [],
        includesMedia: false,
      });
    expect(await codeOf(await zipOf({ 'manifest.json': manifest(999), 'db.sqlite3': 'x' }))).toBe(
      'SCHEMA_TOO_NEW',
    );
    expect(await codeOf(await zipOf({ 'manifest.json': manifest(1), 'db.sqlite3': 'x' }))).toBe(
      'CORRUPT_DATABASE',
    );
    expect(await codeOf(await zipOf({ 'manifest.json': manifest(1), 'media\\evil': 'x' }))).toBe(
      'UNSAFE_ARCHIVE',
    );
  });
});
