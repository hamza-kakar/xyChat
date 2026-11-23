/**
 * Backup snapshot, backup reading and the restore commit (§10.6) against
 * the real sqlite-wasm stack. Chromium-only per ADR 0007.
 */
import { loadSqlite } from '../../src/storage/sqlite/open';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { commitImport, type ImportCommitInput } from '../../src/storage/sqlite/import-commit';
import { createImportRecord } from '../../src/storage/sqlite/import-record';
import { buildBackupSnapshot, estimateBackupBytes } from '../../src/storage/sqlite/backup-snapshot';
import {
  listBackupChats,
  openBackupDatabase,
  readBackupChat,
  type BackupChatContent,
} from '../../src/storage/sqlite/backup-read';
import { commitRestore, type RestoreChatPlan } from '../../src/storage/sqlite/restore-commit';
import { createScratchDatabases, type ScratchDatabases } from '../../src/storage/sqlite/scratch-db';
import { asChatId } from '../../src/core/ids';
import type { ParsedMessage } from '../../src/core/model';
import { msg, openContractDb, recordInput, RUN_FACTS } from './contract-helpers';
import type { SqliteDatabase } from '../../src/storage/sqlite/open';
import type { SqliteChatRepository } from '../../src/storage/sqlite/sqlite-repository';

let scratch: ScratchDatabases;
let db: SqliteDatabase;
let repo: SqliteChatRepository;

beforeAll(async () => {
  scratch = createScratchDatabases(await loadSqlite());
});

beforeEach(async () => {
  ({ db, repo } = await openContractDb());
});

afterEach(() => {
  db.close();
});

/** A 32-hex fingerprint from a small number. */
function fp(n: number): string {
  return n.toString(16).padStart(32, '0');
}

function photo(seq: number, minute: number): ParsedMessage {
  return {
    ...msg(seq, 'a photo', minute),
    kind: 'media',
    attachment: { fileName: 'IMG-1.jpg', mediaType: 'image', status: 'referenced' },
  };
}

/** A chat with text, a poll, a stored photo and an omitted file. */
function chatInput(importId: string, chatId: string, title: string): ImportCommitInput {
  const poll: ParsedMessage = {
    ...msg(2, 'Dinner?', 2),
    kind: 'poll',
    poll: { question: 'Dinner?', options: [{ text: 'Rice', votes: 2 }] },
  };
  return {
    importId,
    targetChatId: chatId,
    newChat: { title, isGroup: true, sourcePlatform: 'ios', dateOrder: 'DMY' },
    messages: [
      { fingerprint: fp(1), message: msg(0, 'hello', 0) },
      { fingerprint: fp(2), message: msg(1, 'hi there', 1, 'Ali Khan') },
      { fingerprint: fp(3), message: poll },
      { fingerprint: fp(4), message: photo(3, 3) },
      { fingerprint: fp(5), message: { ...photo(4, 4), body: '' } },
    ],
    attachments: [
      {
        id: `${chatId}-a1`,
        fingerprintOfMessage: fp(4),
        fileName: 'IMG-1.jpg',
        mediaType: 'image',
        mime: 'image/jpeg',
        byteSize: 1234,
        opfsPath: `media/${chatId}/${chatId}-a1.jpg`,
        thumbPath: `thumbs/${chatId}/${chatId}-a1.jpg`,
        width: 640,
        height: 480,
        durationMs: null,
        status: 'present',
      },
      {
        id: `${chatId}-a2`,
        fingerprintOfMessage: fp(5),
        fileName: null,
        mediaType: 'other',
        mime: null,
        byteSize: null,
        opfsPath: null,
        thumbPath: null,
        width: null,
        height: null,
        durationMs: null,
        status: 'omitted',
      },
    ],
    fileName: 'chat.zip',
    fileBytes: 999,
    parserVersion: '1.2.0',
    report: RUN_FACTS,
  };
}

/** Imports a chat, picks "me" and bookmarks its second message. */
function seedChat(target: SqliteDatabase, chatId: string, title: string): void {
  createImportRecord(target, { ...recordInput(`imp-${chatId}`), parserVersion: '1.2.0' });
  commitImport(target, chatInput(`imp-${chatId}`, chatId, title));
  target.run(
    `UPDATE chats SET self_participant_id =
       (SELECT id FROM participants WHERE chat_id = ? AND display_name = 'Ali Khan') WHERE id = ?`,
    [chatId, chatId],
  );
  target.run(
    `INSERT INTO bookmarks (id, chat_id, message_id, note, created_at)
     SELECT ?, chat_id, id, 'remember', '2026-11-20T10:00:00Z' FROM messages WHERE fingerprint = ?
       AND chat_id = ?`,
    [`bm-${chatId}`, fp(2), chatId],
  );
}

function fingerprints(target: SqliteDatabase, chatId: string): string[] {
  return target
    .selectArrays('SELECT fingerprint FROM messages WHERE chat_id = ? ORDER BY seq', [chatId])
    .map((row) => String(row[0]));
}

function readOnlyChat(bytes: Uint8Array, chatId: string): BackupChatContent {
  const opened = openBackupDatabase(scratch, bytes);
  if (!opened.ok) {
    throw new Error(opened.error.code);
  }
  try {
    const content = readBackupChat(opened.value, chatId);
    if (!content.ok) {
      throw new Error(content.error.code);
    }
    return content.value;
  } finally {
    opened.value.close();
  }
}

function plan(
  content: BackupChatContent,
  action: RestoreChatPlan['action'],
  targetChatId: string,
  importId: string,
): RestoreChatPlan {
  return {
    action,
    replaceChatId: action === 'replace' ? targetChatId : null,
    selfName: content.selfName,
    bookmarks: content.bookmarks,
    commit: {
      importId,
      targetChatId,
      newChat: {
        title: content.title,
        isGroup: content.isGroup,
        sourcePlatform: content.sourcePlatform,
        dateOrder: content.dateOrder,
      },
      messages: content.messages,
      attachments: content.attachments.map((a, index) => ({
        id: `${importId}-${String(index)}`,
        fingerprintOfMessage: a.fingerprintOfMessage,
        fileName: a.fileName,
        mediaType: a.mediaType,
        mime: a.mime,
        byteSize: a.byteSize,
        opfsPath: a.sourcePath === null ? null : `media/${targetChatId}/r${String(index)}.jpg`,
        thumbPath: null,
        width: a.width,
        height: a.height,
        durationMs: a.durationMs,
        status: a.status,
      })),
      fileName: 'backup.zip',
      fileBytes: 10,
      parserVersion: content.parserVersion ?? '0.0.0',
      report: RUN_FACTS,
    },
  };
}

describe('backup snapshot', () => {
  it('copies the chosen chats without settings and lists their media', () => {
    seedChat(db, 'chat-a', 'Family');
    seedChat(db, 'chat-b', 'Work');
    db.run("INSERT INTO meta (key, value) VALUES ('app_lock', 'secret')");

    const snapshot = buildBackupSnapshot(db, scratch, ['chat-b', 'missing']);
    expect(snapshot.chats.map((chat) => chat.id)).toEqual(['chat-b']);
    expect(snapshot.chats[0]?.messageCount).toBe(5);
    expect(snapshot.mediaPaths).toEqual([
      'media/chat-b/chat-b-a1.jpg',
      'thumbs/chat-b/chat-b-a1.jpg',
    ]);

    const opened = openBackupDatabase(scratch, snapshot.bytes);
    expect(opened.ok).toBe(true);
    if (!opened.ok) {
      return;
    }
    const meta = opened.value.selectArrays('SELECT key FROM meta ORDER BY key');
    expect(meta.map((row) => row[0])).toEqual(['schema_version']);
    const listed = listBackupChats(opened.value);
    expect(listed.ok && listed.value.map((chat) => [chat.title, chat.mediaCount])).toEqual([
      ['Work', 1],
    ]);
    opened.value.close();
  });

  it('backs up every chat when no ids are given, in batches', () => {
    seedChat(db, 'chat-a', 'Family');
    seedChat(db, 'chat-b', 'Work');
    const snapshot = buildBackupSnapshot(db, scratch, null);
    expect(snapshot.chats.map((chat) => chat.title).sort()).toEqual(['Family', 'Work']);
    expect(readOnlyChat(snapshot.bytes, 'chat-a').messages.map((m) => m.fingerprint)).toEqual(
      fingerprints(db, 'chat-a'),
    );
  });

  it('estimates more with media than without', () => {
    seedChat(db, 'chat-a', 'Family');
    const without = estimateBackupBytes(db, null, false);
    expect(without).toBeGreaterThan(0);
    expect(estimateBackupBytes(db, ['chat-a'], true)).toBeGreaterThan(without + 1234);
    expect(estimateBackupBytes(db, [], true)).toBe(0);
  });
});

describe('backup reading', () => {
  it('reads messages, attachments, bookmarks and me', () => {
    seedChat(db, 'chat-a', 'Family');
    const content = readOnlyChat(buildBackupSnapshot(db, scratch, null).bytes, 'chat-a');
    expect(content.title).toBe('Family');
    expect(content.selfName).toBe('Ali Khan');
    expect(content.parserVersion).toBe('1.2.0');
    expect(content.messages[2]?.message.poll?.question).toBe('Dinner?');
    expect(content.messages[3]?.message.attachment?.status).toBe('referenced');
    expect(content.attachments.map((a) => [a.status, a.sourcePath])).toEqual([
      ['present', 'media/chat-a/chat-a-a1.jpg'],
      ['omitted', null],
    ]);
    expect(content.bookmarks).toEqual([
      { fingerprint: fp(2), note: 'remember', createdAt: '2026-11-20T10:00:00Z' },
    ]);
  });

  it('rejects bytes that are not a database', () => {
    const opened = openBackupDatabase(scratch, new TextEncoder().encode('not sqlite at all'));
    expect(opened.ok || opened.error.code).toBe('CORRUPT_DATABASE');
  });

  it('rejects a database from a newer app', () => {
    const newer = scratch.create();
    newer.exec(
      "CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL); INSERT INTO meta VALUES ('schema_version', '999');",
    );
    for (const table of [
      'chats',
      'participants',
      'messages',
      'attachments',
      'bookmarks',
      'imports',
    ]) {
      newer.exec(`CREATE TABLE ${table} (id TEXT)`);
    }
    const bytes = newer.exportBytes();
    newer.close();
    const opened = openBackupDatabase(scratch, bytes);
    expect(opened.ok || opened.error.code).toBe('SCHEMA_TOO_NEW');
  });

  it('rejects a database without the app tables', () => {
    const other = scratch.create();
    other.exec('CREATE TABLE notes (body TEXT)');
    const bytes = other.exportBytes();
    other.close();
    const opened = openBackupDatabase(scratch, bytes);
    expect(opened.ok || opened.error.code).toBe('CORRUPT_DATABASE');
  });

  it('rejects tampered rows and unknown chats', () => {
    seedChat(db, 'chat-a', 'Family');
    const snapshot = buildBackupSnapshot(db, scratch, null);
    const tampered = openBackupDatabase(scratch, snapshot.bytes);
    if (!tampered.ok) {
      throw new Error('snapshot did not open');
    }
    expect(readBackupChat(tampered.value, 'nope').ok).toBe(false);
    tampered.value.run("UPDATE attachments SET opfs_path = '../../etc/x' WHERE status = 'present'");
    const badPath = readBackupChat(tampered.value, 'chat-a');
    expect(badPath.ok || badPath.error.code).toBe('CORRUPT_DATABASE');
    tampered.value.run('UPDATE attachments SET opfs_path = NULL');
    tampered.value.run("UPDATE messages SET ts_local = '2026-13-40T00:00:00' WHERE seq = 0");
    const badDate = readBackupChat(tampered.value, 'chat-a');
    expect(badDate.ok || badDate.error.code).toBe('CORRUPT_DATABASE');
    tampered.value.run("UPDATE messages SET fingerprint = 'x' WHERE seq = 0");
    expect(readBackupChat(tampered.value, 'chat-a').ok).toBe(false);
    tampered.value.close();
  });
});

describe('restore commit', () => {
  it('restores a deleted chat with identical fingerprints, me and bookmarks', () => {
    seedChat(db, 'chat-a', 'Family');
    const before = fingerprints(db, 'chat-a');
    const content = readOnlyChat(buildBackupSnapshot(db, scratch, null).bytes, 'chat-a');
    repo.deleteChat(asChatId('chat-a'));

    createImportRecord(db, recordInput('imp-r1'));
    const [result] = commitRestore(db, [plan(content, 'new', 'chat-a', 'imp-r1')]);
    expect(result?.messagesInserted).toBe(5);
    expect(result?.bookmarksRestored).toBe(1);
    expect(fingerprints(db, 'chat-a')).toEqual(before);
    const chat = repo.getChat(asChatId('chat-a'));
    expect(chat?.title).toBe('Family');
    const me = repo
      .getParticipants(asChatId('chat-a'))
      .find((p) => p.id === chat?.selfParticipantId);
    expect(me?.displayName).toBe('Ali Khan');
    expect(repo.listBookmarks(asChatId('chat-a'))[0]?.bookmark.note).toBe('remember');
    // The restored rows are searchable again.
    const hits = repo.search({
      query: 'there',
      chatId: null,
      authorId: null,
      kinds: null,
      dateFromTsKey: null,
      dateToTsKey: null,
      cursor: null,
      limit: 10,
    });
    expect(hits.hits).toHaveLength(1);
  });

  it('merges without duplicates and keeps the local me and notes', () => {
    seedChat(db, 'chat-a', 'Family');
    const content = readOnlyChat(buildBackupSnapshot(db, scratch, null).bytes, 'chat-a');
    db.run("UPDATE bookmarks SET note = 'local note'");
    createImportRecord(db, recordInput('imp-r2'));
    const [result] = commitRestore(db, [plan(content, 'merge', 'chat-a', 'imp-r2')]);
    expect(result?.messagesInserted).toBe(0);
    expect(result?.duplicatesSkipped).toBe(5);
    expect(result?.bookmarksRestored).toBe(0);
    expect(repo.listBookmarks(asChatId('chat-a'))[0]?.bookmark.note).toBe('local note');
    expect(repo.listImports(asChatId('chat-a')).map((i) => i.status)).toEqual([
      'complete',
      'complete',
    ]);
  });
});

describe('restore commit: replace', () => {
  it('replaces a chat atomically with the backup copy', () => {
    seedChat(db, 'chat-a', 'Family');
    const content = readOnlyChat(buildBackupSnapshot(db, scratch, null).bytes, 'chat-a');
    db.run("UPDATE chats SET title = 'Renamed' WHERE id = 'chat-a'");
    db.run("DELETE FROM messages WHERE chat_id = 'chat-a' AND seq = 0");
    createImportRecord(db, recordInput('imp-r3'));
    const [result] = commitRestore(db, [plan(content, 'replace', 'chat-a', 'imp-r3')]);
    expect(result?.messagesInserted).toBe(5);
    expect(repo.getChat(asChatId('chat-a'))?.title).toBe('Family');
    expect(repo.listImports(asChatId('chat-a')).map((i) => i.id)).toEqual(['imp-r3']);
  });

  it('rolls everything back when one chat fails', () => {
    seedChat(db, 'chat-a', 'Family');
    const content = readOnlyChat(buildBackupSnapshot(db, scratch, null).bytes, 'chat-a');
    createImportRecord(db, recordInput('imp-r4'));
    createImportRecord(db, recordInput('imp-r5'));
    const broken = plan(content, 'new', 'chat-z', 'imp-r5');
    const good = plan(content, 'replace', 'chat-a', 'imp-r4');
    // Two attachment rows with one id: the second insert fails.
    const failing: RestoreChatPlan = {
      ...broken,
      commit: {
        ...broken.commit,
        attachments: broken.commit.attachments.map((a) => ({ ...a, id: 'dup' })),
      },
    };
    expect(() => commitRestore(db, [good, failing])).toThrow();
    expect(repo.getChat(asChatId('chat-z'))).toBeNull();
    expect(fingerprints(db, 'chat-a')).toHaveLength(5);
    expect(repo.listImports(asChatId('chat-a')).map((i) => i.id)).toEqual(['imp-chat-a']);
  });
});
