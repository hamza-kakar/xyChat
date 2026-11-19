/**
 * Repository contract tests (§10.5, §19.1, §19.4): run SqliteChatRepository
 * against the real sqlite-wasm stack directly so v8 coverage instruments
 * the storage layer. Chromium-only per ADR 0007.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import initSqlite3 from '@sqlite.org/sqlite-wasm';
import { wrapDatabase, verifyFts5Trigram, type SqliteDatabase } from '../../src/storage/sqlite/open';
import { migrate } from '../../src/storage/sqlite/migrate';
import { SqliteChatRepository } from '../../src/storage/sqlite/sqlite-repository';
import { commitImport, type ImportCommitInput } from '../../src/storage/sqlite/import-commit';
import { createImportRecord } from '../../src/storage/sqlite/import-record';
import { asChatId, type ChatId } from '../../src/core/ids';
import type { ParsedMessage } from '../../src/core/model';

let db: SqliteDatabase;
let repo: SqliteChatRepository;
let chatId: ChatId;

beforeEach(async () => {
  const sqlite3 = await initSqlite3();
  const dbRaw = new sqlite3.oo1.DB({ filename: ':memory:', flags: 'c' });
  db = wrapDatabase(dbRaw);
  db.exec('PRAGMA foreign_keys=ON; PRAGMA temp_store=MEMORY;');
  migrate(db);
  verifyFts5Trigram(db);
  repo = new SqliteChatRepository(db);
});

afterEach(() => {
  db.close();
});

function recordInput(importId: string) {
  return { importId, fileName: 'contract.txt', fileBytes: 100, parserVersion: '1.0.0' };
}

function msg(seq: number, body: string, minute: number, author = 'Sara'): ParsedMessage {
  return {
    seq, sourceLine: seq + 1,
    timestamp: { year: 2026, month: 11, day: 17, hour: 21, minute, second: 0 },
    author, kind: 'text', body, isEdited: false,
    attachment: null, poll: null, location: null,
  };
}

function mediaMsg(seq: number, body: string, minute: number, status: 'omitted' | 'referenced'): ParsedMessage {
  return {
    seq, sourceLine: seq + 1,
    timestamp: { year: 2026, month: 11, day: 17, hour: 21, minute, second: 0 },
    author: 'Sara', kind: 'media', body, isEdited: false,
    attachment: { fileName: status === 'referenced' ? 'IMG-001.jpg' : null, mediaType: 'image', status },
    poll: null, location: null,
  };
}

function threeMsgInput(importId: string, chatIdToTarget: string | null): ImportCommitInput {
  return {
    importId, targetChatId: chatIdToTarget,
    newChat: { title: 'Contract Test Chat', isGroup: false, sourcePlatform: 'android', dateOrder: 'DMY' },
    messages: [
      { fingerprint: 'fp-0', message: msg(0, 'hello world', 0) },
      { fingerprint: 'fp-1', message: msg(1, 'searchable needle here', 1, 'Ali Khan') },
      { fingerprint: 'fp-2', message: msg(2, 'goodbye', 2) },
    ],
    attachments: [], fileName: 'contract.txt', fileBytes: 100, parserVersion: '1.0.0',
  };
}

describe('repository contract: boot and import', () => {
  it('opens, migrates and verifies FTS5 trigram', () => {
    expect(db).toBeDefined();
  });

  it('commits an import and reads it back', () => {
    createImportRecord(db, recordInput('imp-1'));
    const result = commitImport(db, threeMsgInput('imp-1', null));
    expect(result.messagesInserted).toBe(3);
    chatId = asChatId(result.chatId);
    const chat = repo.listChats().find((c) => c.title === 'Contract Test Chat');
    expect(chat?.messageCount).toBe(3);
    expect(repo.getChat(chatId)?.sourcePlatform).toBe('android');
    const participants = repo.getParticipants(chatId);
    expect(participants.map((p) => p.displayName)).toEqual(['Sara', 'Ali Khan']);
    const window = repo.getMessageWindow({ chatId, anchorSeq: 1, before: 5, after: 5 });
    expect(window.messages.map((m) => m.body)).toEqual(['hello world', 'searchable needle here', 'goodbye']);
    expect(window.messages[1]?.authorName).toBe('Ali Khan');
  });

  it('skips duplicates on re-import', () => {
    createImportRecord(db, recordInput('imp-d1'));
    const first = commitImport(db, threeMsgInput('imp-d1', null));
    const localChat = asChatId(first.chatId);
    createImportRecord(db, recordInput('imp-d2'));
    const second = commitImport(db, threeMsgInput('imp-d2', localChat));
    expect(second.messagesInserted).toBe(0);
    expect(second.duplicatesSkipped).toBe(3);
  });

  it('interleaves a superset with new messages between stored ones', () => {
    createImportRecord(db, recordInput('imp-sup-1'));
    const first = commitImport(db, threeMsgInput('imp-sup-1', null));
    const localChat = asChatId(first.chatId);
    createImportRecord(db, recordInput('imp-sup-2'));
    const second = commitImport(db, {
      importId: 'imp-sup-2', targetChatId: localChat,
      newChat: { title: '', isGroup: false, sourcePlatform: 'android', dateOrder: 'DMY' },
      messages: [
        { fingerprint: 'fp-0', message: msg(0, 'hello world', 0) },
        { fingerprint: 'fp-B2', message: msg(1, 'B2 between', 1) },
        { fingerprint: 'fp-1', message: msg(2, 'searchable needle here', 2, 'Ali Khan') },
        { fingerprint: 'fp-2', message: msg(3, 'goodbye', 3) },
        { fingerprint: 'fp-D4', message: msg(4, 'D4 new', 4) },
      ],
      attachments: [], fileName: 'contract.txt', fileBytes: 100, parserVersion: '1.0.0',
    });
    expect(second.messagesInserted).toBe(2);
    expect(second.duplicatesSkipped).toBe(3);
    const window = repo.getMessageWindow({ chatId: localChat, anchorSeq: 0, before: 10, after: 10 });
    expect(window.messages.map((m) => m.body)).toEqual([
      'hello world', 'B2 between', 'searchable needle here', 'goodbye', 'D4 new',
    ]);
    expect(window.messages.map((m) => m.seq)).toEqual([0, 1, 2, 3, 4]);
  });
});

describe('repository contract: media upgrades', () => {
  function omittedMediaInput(importId: string, chatIdToTarget: string | null): ImportCommitInput {
    return {
      importId, targetChatId: chatIdToTarget,
      newChat: { title: 'Media Chat', isGroup: false, sourcePlatform: 'android', dateOrder: 'DMY' },
      messages: [
        { fingerprint: 'fp-om', message: mediaMsg(0, 'photo message', 0, 'omitted') },
      ],
      attachments: [
        { id: 'att-om', fingerprintOfMessage: 'fp-om', fileName: null, mediaType: 'image', mime: 'image/jpeg', byteSize: null, opfsPath: null, thumbPath: null, width: null, height: null, durationMs: null, status: 'omitted' },
      ],
      fileName: 'media.txt', fileBytes: 50, parserVersion: '1.0.0',
    };
  }

  function presentMediaInput(importId: string, chatIdToTarget: string | null): ImportCommitInput {
    return {
      importId, targetChatId: chatIdToTarget,
      newChat: { title: 'Media Chat', isGroup: false, sourcePlatform: 'android', dateOrder: 'DMY' },
      messages: [
        { fingerprint: 'fp-om', message: mediaMsg(0, 'photo message', 0, 'referenced') },
      ],
      attachments: [
        { id: 'att-p', fingerprintOfMessage: 'fp-om', fileName: 'IMG-001.jpg', mediaType: 'image', mime: 'image/jpeg', byteSize: 500, opfsPath: 'media/x/att-1.jpg', thumbPath: null, width: 100, height: 80, durationMs: null, status: 'present' },
      ],
      fileName: 'media.txt', fileBytes: 50, parserVersion: '1.0.0',
    };
  }

  it('upgrades omitted media to present when export provides bytes', () => {
    createImportRecord(db, recordInput('imp-up-1'));
    const first = commitImport(db, omittedMediaInput('imp-up-1', null));
    const localChat = asChatId(first.chatId);
    const rows = db.selectObjects('SELECT status FROM attachments');
    expect(rows[0]?.['status']).toBe('omitted');
    createImportRecord(db, recordInput('imp-up-2'));
    const second = commitImport(db, presentMediaInput('imp-up-2', localChat));
    expect(second.mediaUpgraded).toBe(1);
    expect(second.duplicatesSkipped).toBe(1);
    const after = db.selectObjects('SELECT status, opfs_path, file_name, width FROM attachments');
    expect(after[0]).toEqual({ status: 'present', opfs_path: 'media/x/att-1.jpg', file_name: 'IMG-001.jpg', width: 100 });
  });

  it('re-importing the same without-media export makes 0 upgrades', () => {
    createImportRecord(db, recordInput('imp-om-1'));
    const first = commitImport(db, omittedMediaInput('imp-om-1', null));
    chatId = asChatId(first.chatId);
    createImportRecord(db, recordInput('imp-om-2'));
    const second = commitImport(db, omittedMediaInput('imp-om-2', chatId));
    expect(second.mediaUpgraded).toBe(0);
    expect(second.duplicatesSkipped).toBe(1);
    const rows = db.selectObjects('SELECT status FROM attachments');
    expect(rows[0]?.['status']).toBe('omitted');
  });
});

describe('repository contract: queries', () => {
  beforeEach(() => {
    createImportRecord(db, recordInput('imp-q'));
    const result = commitImport(db, threeMsgInput('imp-q', null));
    chatId = asChatId(result.chatId);
  });

  it('finds seq by date', () => {
    const ts0 = { year: 2026, month: 11, day: 17, hour: 21, minute: 0, second: 0 };
    const ts1 = { year: 2026, month: 11, day: 17, hour: 21, minute: 1, second: 0 };
    expect(repo.findSeqByDate(chatId, ts0)).toBe(0);
    expect(repo.findSeqByDate(chatId, ts1)).toBe(1);
    expect(repo.findSeqByDate(chatId, { ...ts1, hour: 22 })).toBeNull();
  });

  it('searches with filters and snippets', () => {
    const page = repo.search({ chatId: null, query: 'needle', authorId: null, kinds: null, dateFromTsKey: null, dateToTsKey: null, limit: 50, cursor: null });
    expect(page.hits).toHaveLength(1);
    expect(page.hits[0]?.snippet).toContain('needle');
    expect(page.hits[0]?.authorName).toBe('Ali Khan');
    const byKind = repo.search({ chatId, query: 'goodbye', authorId: null, kinds: ['text'], dateFromTsKey: null, dateToTsKey: null, limit: 50, cursor: null });
    expect(byKind.hits).toHaveLength(1);
  });

  it('paginates in-chat search forward by seq (§11 keyset)', () => {
    // Seed 5 like-named messages; page size 2 must walk them in seq order
    // with no overlap between pages.
    const rows: string[] = [];
    const params: (string | number | null)[] = [];
    for (let i = 0; i < 5; i += 1) {
      rows.push(`(NULL, ?, ?, ?, ?, ?, NULL, 'text', ?, 0, NULL, 'imp-q')`);
      const tsKey = Date.UTC(2026, 10, 17, 22, i, 0) / 1000;
      params.push(chatId, `pg-fp-${i}`, 10 + i, `2026-11-17T22:${String(i).padStart(2, '0')}:00`, tsKey, `paged match ${i}`);
    }
    db.run(
      `INSERT INTO messages (id, chat_id, fingerprint, seq, ts_local, ts_key, author_id, kind, body, is_edited, extra_json, import_id)
       VALUES ${rows.join(', ')}`,
      params,
    );
    const base = { chatId, query: 'paged', authorId: null as null, kinds: null as null, dateFromTsKey: null as null, dateToTsKey: null as null };
    const page1 = repo.search({ ...base, limit: 2, cursor: null });
    expect(page1.hits.map((h) => h.seq)).toEqual([10, 11]);
    expect(page1.nextCursor).not.toBeNull();
    const page2 = repo.search({ ...base, limit: 2, cursor: page1.nextCursor });
    expect(page2.hits.map((h) => h.seq)).toEqual([12, 13]);
    const page3 = repo.search({ ...base, limit: 2, cursor: page2.nextCursor });
    expect(page3.hits.map((h) => h.seq)).toEqual([14]);
    expect(page3.nextCursor).toBeNull();
  });

  it('caps the 1–2 char LIKE fallback at 500 results (§11)', () => {
    const rows: string[] = [];
    const params: (string | number | null)[] = [];
    for (let i = 0; i < 501; i += 1) {
      rows.push(`(NULL, ?, ?, ?, ?, ?, NULL, 'text', ?, 0, NULL, 'imp-q')`);
      const tsKey = Date.UTC(2026, 10, 17, 23, Math.floor(i / 60), i % 60) / 1000;
      params.push(chatId, `like-fp-${i}`, 100 + i, `2026-11-17T23:${String(Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}`, tsKey, `ab hit ${i}`);
    }
    db.run(
      `INSERT INTO messages (id, chat_id, fingerprint, seq, ts_local, ts_key, author_id, kind, body, is_edited, extra_json, import_id)
       VALUES ${rows.join(', ')}`,
      params,
    );
    // Requested limit above the cap: the LIKE path clamps to 500 instead of
    // returning nothing.
    const page = repo.search({ chatId, query: 'ab', authorId: null, kinds: null, dateFromTsKey: null, dateToTsKey: null, limit: 1000, cursor: null });
    expect(page.hits).toHaveLength(500);
    expect(page.nextCursor).not.toBeNull();
    // Global (chatId null) with a 1–2 char query stays empty (§11: in-chat only).
    const global = repo.search({ chatId: null, query: 'ab', authorId: null, kinds: null, dateFromTsKey: null, dateToTsKey: null, limit: 50, cursor: null });
    expect(global.hits).toHaveLength(0);
  });

  it('lists attachments, links and stats', () => {
    expect(repo.listAttachments({ chatId, types: ['image'], cursor: null, limit: 50 }).attachments).toHaveLength(0);
    const stats = repo.getChatStats(chatId);
    expect(stats.totalsByKind.text).toBe(3);
    expect(stats.dateRange?.first.minute).toBe(0);
    expect(stats.dateRange?.last.minute).toBe(2);
  });

  it('extracts links from text messages with snippets (§12.6)', () => {
    db.run(
      `INSERT INTO messages (id, chat_id, fingerprint, seq, ts_local, ts_key, author_id, kind, body, is_edited, extra_json, import_id)
       VALUES (NULL, ?, 'link-fp-0', 50, '2026-11-17T23:00:00', ?, NULL, 'text', 'see https://example.com/docs?page=1 for details', 0, NULL, 'imp-q')`,
      [chatId, Date.UTC(2026, 10, 17, 23, 0, 0) / 1000],
    );
    const page = repo.listLinks({ chatId, cursor: null, limit: 50 });
    expect(page.links).toHaveLength(1);
    expect(page.links[0]?.url).toBe('https://example.com/docs?page=1');
    expect(page.links[0]?.snippet).toContain('example.com');
    expect(page.nextCursor).toBeNull();
    // Keyset paging: a full page yields the last rowid as the cursor.
    const limited = repo.listLinks({ chatId, cursor: null, limit: 1 });
    expect(limited.links).toHaveLength(1);
    expect(limited.nextCursor).not.toBeNull();
  });
});

describe('repository contract: chat management', () => {
  beforeEach(() => {
    createImportRecord(db, recordInput('imp-m'));
    const result = commitImport(db, threeMsgInput('imp-m', null));
    chatId = asChatId(result.chatId);
  });

  it('manages self and rename', () => {
    const participants = repo.getParticipants(chatId);
    const first = participants[0];
    expect(first).toBeDefined();
    if (first === undefined) return;
    repo.setSelf(chatId, first.id);
    expect(repo.getChat(chatId)?.selfParticipantId).toBe(first.id);
    repo.renameChat(chatId, 'Renamed');
    expect(repo.getChat(chatId)?.title).toBe('Renamed');
  });

  it('manages bookmarks', () => {
    const window = repo.getMessageWindow({ chatId, anchorSeq: 0, before: 1, after: 1 });
    const message = window.messages[0];
    expect(message).toBeDefined();
    if (message === undefined) return;
    const bookmarkId = repo.addBookmark(chatId, message.rowId, 'note here');
    repo.updateBookmark(bookmarkId, 'edited note');
    const bookmarks = repo.listBookmarks(chatId);
    expect(bookmarks).toHaveLength(1);
    expect(bookmarks[0]?.bookmark.note).toBe('edited note');
    expect(bookmarks[0]?.message.body).toBe(message.body);
    repo.removeBookmark(bookmarkId);
    expect(repo.listBookmarks(chatId)).toHaveLength(0);
  });

  it('lists import history and storage usage', () => {
    const imports = repo.listImports(chatId);
    expect(imports).toHaveLength(1);
    expect(imports[0]?.status).toBe('complete');
    expect(imports[0]?.parserVersion).toBe('1.0.0');
    expect(repo.storageUsage().totalBytes).toBe(0);
  });

  it('rolls back in_progress imports (§9.3)', () => {
    createImportRecord(db, recordInput('imp-rb'));
    const paths = repo.rollbackInProgressImports();
    expect(paths).toEqual([]);
    expect(repo.listImports(chatId).every((i) => i.status !== 'in_progress')).toBe(true);
  });

  it('deletes a chat with cascade', () => {
    expect(repo.getChat(chatId)).not.toBeNull();
    repo.deleteChat(chatId);
    expect(repo.getChat(chatId)).toBeNull();
    expect(repo.listChats().find((c) => c.id === chatId)).toBeUndefined();
    expect(repo.getParticipants(chatId)).toHaveLength(0);
  });
});
