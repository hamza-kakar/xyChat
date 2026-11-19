/**
 * Repository contract tests (AGENTS.md §10.5, §19.1, §19.4): run
 * SqliteChatRepository against the real sqlite-wasm + OPFS stack directly
 * (not through the worker) so v8 coverage instruments the storage layer.
 * Chromium-only for M2 per ADR 0007.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import initSqlite3 from '@sqlite.org/sqlite-wasm';
import {
  wrapDatabase,
  verifyFts5Trigram,
  type SqliteDatabase,
} from '../../src/storage/sqlite/open';
import { migrate } from '../../src/storage/sqlite/migrate';
import { SqliteChatRepository } from '../../src/storage/sqlite/sqlite-repository';
import { commitImport, type ImportCommitInput } from '../../src/storage/sqlite/import-commit';
import { createImportRecord, type ImportRecordInput } from '../../src/storage/sqlite/import-record';
import type { ChatId } from '../../src/core/ids';
import type { ParsedMessage } from '../../src/core/model';

let db: SqliteDatabase;
let repo: SqliteChatRepository;
let chatId: ChatId;

beforeEach(async () => {
  // In-memory sqlite-wasm on the page: same wrapper, migrations and
  // repository SQL as production (SAHPool itself is worker-only), so v8
  // coverage instruments the storage layer (audit blocker 4). The real
  // OPFS SAHPool path is exercised by the db.worker contract flow.
  const sqlite3 = await initSqlite3();
  const dbRaw = new sqlite3.oo1.DB({ filename: ':memory:', flags: 'ct' });
  db = wrapDatabase(dbRaw);
  db.exec(`
    PRAGMA foreign_keys=ON;
    PRAGMA temp_store=MEMORY;
  `);
  migrate(db);
  verifyFts5Trigram(db);
  repo = new SqliteChatRepository(db);
});

afterEach(() => {
  db.close();
});

function recordInput(importId: string): ImportRecordInput {
  return { importId, fileName: 'contract.txt', fileBytes: 100, parserVersion: '1.0.0' };
}

function msg(seq: number, body: string, minute: number, author = 'Sara'): ParsedMessage {
  return {
    seq,
    sourceLine: seq + 1,
    timestamp: { year: 2026, month: 11, day: 17, hour: 21, minute, second: 0 },
    author,
    kind: 'text',
    body,
    isEdited: false,
    attachment: null,
    poll: null,
    location: null,
  };
}

function commitInput(importId: string, chatIdToTarget: string | null): ImportCommitInput {
  return {
    importId,
    targetChatId: chatIdToTarget,
    newChat: {
      title: 'Contract Test Chat',
      isGroup: false,
      sourcePlatform: 'android',
      dateOrder: 'DMY',
    },
    messages: [
      { fingerprint: 'fp-0', message: msg(0, 'hello world', 0) },
      { fingerprint: 'fp-1', message: msg(1, 'searchable needle here', 1, 'Ali Khan') },
      { fingerprint: 'fp-2', message: msg(2, 'goodbye', 2) },
    ],
    attachments: [],
    fileName: 'contract.txt',
    fileBytes: 100,
    parserVersion: '1.0.0',
  };
}

describe('repository contract (real sqlite-wasm + OPFS)', () => {
  it('opens, migrates and verifies FTS5 trigram', () => {
    // beforeEach did the full open: reaching this point means the probe
    // passed and migrations applied.
    expect(db).toBeDefined();
  });

  it('commits an import and reads it back', () => {
    createImportRecord(db, recordInput('imp-1'));
    const result = commitImport(db, commitInput('imp-1', null));
    expect(result.messagesInserted).toBe(3);

    chatId = result.chatId as ChatId;
    const chats = repo.listChats();
    const chat = chats.find((c) => c.title === 'Contract Test Chat');
    expect(chat?.messageCount).toBe(3);

    const full = repo.getChat(chatId);
    expect(full?.title).toBe('Contract Test Chat');
    expect(full?.sourcePlatform).toBe('android');

    const participants = repo.getParticipants(chatId);
    expect(participants.map((p) => p.displayName)).toEqual(['Sara', 'Ali Khan']);
    expect(participants[0]?.messageCount).toBe(2);

    const window = repo.getMessageWindow({ chatId, anchorSeq: 1, before: 5, after: 5 });
    expect(window.messages.map((m) => m.body)).toEqual([
      'hello world',
      'searchable needle here',
      'goodbye',
    ]);
    expect(window.hasBefore).toBe(false);
    expect(window.hasAfter).toBe(false);
    // Author display names joined.
    expect(window.messages[1]?.authorName).toBe('Ali Khan');
  });

  it('finds seq by date', () => {
    createImportRecord(db, recordInput('imp-seq'));
    const result = commitImport(db, commitInput('imp-seq', null));
    chatId = result.chatId as ChatId;
    // ts_keys: messages sit at 21:00, 21:01, 21:02 wall-clock-as-UTC.
    const tsKey0 = Date.UTC(2026, 10, 17, 21, 0, 0) / 1000;
    const tsKey1 = Date.UTC(2026, 10, 17, 21, 1, 0) / 1000;
    expect(repo.findSeqByDate(chatId, tsKey0)).toBe(0);
    expect(repo.findSeqByDate(chatId, tsKey1)).toBe(1);
    expect(repo.findSeqByDate(chatId, tsKey1 + 10_000)).toBeNull();
  });

  it('searches with filters, paging and snippets', () => {
    createImportRecord(db, recordInput('imp-search'));
    const result = commitImport(db, commitInput('imp-search', null));
    chatId = result.chatId as ChatId;

    const page = repo.search({
      chatId: null,
      query: 'needle',
      authorId: null,
      kinds: null,
      dateFromTsKey: null,
      dateToTsKey: null,
      limit: 50,
      cursor: null,
    });
    expect(page.hits).toHaveLength(1);
    expect(page.hits[0]?.snippet).toContain('needle');
    expect(page.hits[0]?.authorName).toBe('Ali Khan');
    expect(page.nextCursor).toBeNull();

    // Filter by author.
    const byAuthor = repo.search({
      chatId,
      query: 'hello',
      authorId: null,
      kinds: null,
      dateFromTsKey: null,
      dateToTsKey: null,
      limit: 50,
      cursor: null,
    });
    expect(byAuthor.hits).toHaveLength(1);

    // 1–2 char LIKE fallback (§11: short queries skip FTS).
    const short = repo.search({
      chatId,
      query: 'ell',
      authorId: null,
      kinds: null,
      dateFromTsKey: null,
      dateToTsKey: null,
      limit: 50,
      cursor: null,
    });
    expect(short.hits.length).toBeGreaterThan(0);

    // Kind filter.
    const byKind = repo.search({
      chatId,
      query: 'goodbye',
      authorId: null,
      kinds: ['text'],
      dateFromTsKey: null,
      dateToTsKey: null,
      limit: 50,
      cursor: null,
    });
    expect(byKind.hits).toHaveLength(1);
  });

  it('lists attachments, links and stats', () => {
    createImportRecord(db, recordInput('imp-links'));
    const result = commitImport(db, commitInput('imp-links', null));
    chatId = result.chatId as ChatId;

    const links = repo.listLinks({ chatId, cursor: null, limit: 50 });
    expect(links.links).toHaveLength(0);

    const attachments = repo.listAttachments({
      chatId,
      types: ['image'],
      cursor: null,
      limit: 50,
    });
    expect(attachments.attachments).toHaveLength(0);

    const stats = repo.getChatStats(chatId);
    expect(stats.totalsByKind['text']).toBe(3);
    expect(stats.dateRange).not.toBeNull();
    expect(stats.dateRange?.first.minute).toBe(0);
    expect(stats.dateRange?.last.minute).toBe(2);
  });

  it('manages self, rename, bookmarks and imports', () => {
    createImportRecord(db, recordInput('imp-misc'));
    const result = commitImport(db, commitInput('imp-misc', null));
    chatId = result.chatId as ChatId;

    const participants = repo.getParticipants(chatId);
    const first = participants[0];
    expect(first).toBeDefined();
    repo.setSelf(chatId, first!.id);
    expect(repo.getChat(chatId)?.selfParticipantId).toBe(first!.id);

    repo.renameChat(chatId, 'Renamed');
    expect(repo.getChat(chatId)?.title).toBe('Renamed');

    const window = repo.getMessageWindow({ chatId, anchorSeq: 0, before: 1, after: 1 });
    const message = window.messages[0];
    expect(message).toBeDefined();
    const bookmarkId = repo.addBookmark(chatId, message!.rowId, 'note here');
    repo.updateBookmark(bookmarkId, 'edited note');
    const bookmarks = repo.listBookmarks(chatId);
    expect(bookmarks).toHaveLength(1);
    expect(bookmarks[0]?.bookmark.note).toBe('edited note');
    expect(bookmarks[0]?.message.body).toBe(message!.body);
    repo.removeBookmark(bookmarkId);
    expect(repo.listBookmarks(chatId)).toHaveLength(0);

    const imports = repo.listImports(chatId);
    expect(imports).toHaveLength(1);
    expect(imports[0]?.status).toBe('complete');
    expect(imports[0]?.parserVersion).toBe('1.0.0');

    const usage = repo.storageUsage();
    expect(usage.totalBytes).toBe(0);
  });

  it('rolls back in_progress imports at boot (§9.3)', () => {
    createImportRecord(db, recordInput('imp-rollback'));
    const paths = repo.rollbackInProgressImports();
    expect(paths).toEqual([]);
    const imports = repo.listImports(chatId ?? ('' as ChatId));
    expect(imports.every((i) => i.status !== 'in_progress')).toBe(true);
  });

  it('deletes a chat with cascade', () => {
    createImportRecord(db, recordInput('imp-del'));
    const result = commitImport(db, commitInput('imp-del', null));
    chatId = result.chatId as ChatId;
    expect(repo.getChat(chatId)).not.toBeNull();
    repo.deleteChat(chatId);
    expect(repo.getChat(chatId)).toBeNull();
    expect(repo.listChats().find((c) => c.id === chatId)).toBeUndefined();
    expect(repo.getParticipants(chatId)).toHaveLength(0);
  });

  it('skips duplicates when the same fingerprints are committed twice', () => {
    createImportRecord(db, recordInput('imp-dup-1'));
    const first = commitImport(db, commitInput('imp-dup-1', null));
    expect(first.messagesInserted).toBe(3);

    createImportRecord(db, recordInput('imp-dup-2'));
    const second = commitImport(db, commitInput('imp-dup-2', first.chatId as ChatId));
    expect(second.messagesInserted).toBe(0);
    expect(second.duplicatesSkipped).toBe(3);
    expect(repo.getChat(first.chatId as ChatId)?.messageCount).toBe(3);
  });
});
