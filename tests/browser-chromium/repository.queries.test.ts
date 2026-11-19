/**
 * Repository contract: read queries — windows, dates, search (§10.5, §11,
 * §12.6). Chromium against real sqlite-wasm per ADR 0007.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { commitImport } from '../../src/storage/sqlite/import-commit';
import { createImportRecord } from '../../src/storage/sqlite/import-record';
import { asChatId, type ChatId } from '../../src/core/ids';
import { openContractDb, recordInput, seedTextRows, threeMsgInput } from './contract-helpers';
import type { SqliteDatabase } from '../../src/storage/sqlite/open';
import type { SqliteChatRepository } from '../../src/storage/sqlite/sqlite-repository';

let db: SqliteDatabase;
let repo: SqliteChatRepository;
let chatId: ChatId;

beforeEach(async () => {
  ({ db, repo } = await openContractDb());
  createImportRecord(db, recordInput('imp-q'));
  const result = commitImport(db, threeMsgInput('imp-q', null));
  chatId = asChatId(result.chatId);
});

afterEach(() => {
  db.close();
});

describe('repository contract: queries', () => {
  it('finds seq by date', () => {
    const ts0 = { year: 2026, month: 11, day: 17, hour: 21, minute: 0, second: 0 };
    const ts1 = { year: 2026, month: 11, day: 17, hour: 21, minute: 1, second: 0 };
    expect(repo.findSeqByDate(chatId, ts0)).toBe(0);
    expect(repo.findSeqByDate(chatId, ts1)).toBe(1);
    expect(repo.findSeqByDate(chatId, { ...ts1, hour: 22 })).toBeNull();
  });

  it('searches with filters and snippets', () => {
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
    expect(
      repo.listAttachments({ chatId, types: ['image'], cursor: null, limit: 50 }).attachments,
    ).toHaveLength(0);
    const stats = repo.getChatStats(chatId);
    expect(stats.totalsByKind.text).toBe(3);
    expect(stats.dateRange?.first.minute).toBe(0);
    expect(stats.dateRange?.last.minute).toBe(2);
  });
});

describe('repository contract: search paging (§11)', () => {
  it('paginates in-chat search forward by seq', () => {
    // Seed 5 like-named messages; page size 2 must walk them in seq order
    // with no overlap between pages.
    seedTextRows(db, {
      chatId,
      importId: 'imp-q',
      prefix: 'pg-fp',
      seqStart: 10,
      count: 5,
      body: (i) => `paged match ${i}`,
      tsLocal: (i) => `2026-11-17T22:${String(i).padStart(2, '0')}:00`,
    });
    const base = {
      chatId,
      query: 'paged',
      authorId: null,
      kinds: null,
      dateFromTsKey: null,
      dateToTsKey: null,
    };
    const page1 = repo.search({ ...base, limit: 2, cursor: null });
    expect(page1.hits.map((h) => h.seq)).toEqual([10, 11]);
    expect(page1.nextCursor).not.toBeNull();
    const page2 = repo.search({ ...base, limit: 2, cursor: page1.nextCursor });
    expect(page2.hits.map((h) => h.seq)).toEqual([12, 13]);
    const page3 = repo.search({ ...base, limit: 2, cursor: page2.nextCursor });
    expect(page3.hits.map((h) => h.seq)).toEqual([14]);
    expect(page3.nextCursor).toBeNull();
  });

  it('caps the 1–2 char LIKE fallback at 500 results', () => {
    seedTextRows(db, {
      chatId,
      importId: 'imp-q',
      prefix: 'like-fp',
      seqStart: 100,
      count: 501,
      body: (i) => `ab hit ${i}`,
      tsLocal: (i) =>
        `2026-11-17T23:${String(Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}`,
    });
    // Requested limit above the cap: the LIKE path clamps to 500 instead of
    // returning nothing.
    const page = repo.search({
      chatId,
      query: 'ab',
      authorId: null,
      kinds: null,
      dateFromTsKey: null,
      dateToTsKey: null,
      limit: 1000,
      cursor: null,
    });
    expect(page.hits).toHaveLength(500);
    expect(page.nextCursor).not.toBeNull();
    // Global (chatId null) with a 1–2 char query stays empty (§11: in-chat only).
    const global = repo.search({
      chatId: null,
      query: 'ab',
      authorId: null,
      kinds: null,
      dateFromTsKey: null,
      dateToTsKey: null,
      limit: 50,
      cursor: null,
    });
    expect(global.hits).toHaveLength(0);
  });
});

describe('repository contract: link extraction (§12.6)', () => {
  it('extracts links from text messages with snippets', () => {
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
