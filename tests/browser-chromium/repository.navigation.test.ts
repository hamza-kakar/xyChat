/**
 * Repository contract: in-chat search navigation and calendar days. Chromium against real sqlite-wasm per ADR 0007.
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
  createImportRecord(db, recordInput('imp-n'));
  chatId = asChatId(commitImport(db, threeMsgInput('imp-n', null)).chatId);
});

afterEach(() => {
  db.close();
});

const base = { authorId: null, kinds: null, dateFromTsKey: null, dateToTsKey: null } as const;

describe('repository contract: in-chat match list', () => {
  it('lists every matching seq in order, with filters', () => {
    seedTextRows(db, {
      chatId,
      importId: 'imp-n',
      prefix: 'nav-fp',
      seqStart: 10,
      count: 6,
      body: (i) => (i % 2 === 0 ? `travel plan ${i}` : `other ${i}`),
      tsLocal: (i) => `2026-11-17T22:${String(i).padStart(2, '0')}:00`,
    });
    const all = repo.listMatchingSeqs({ ...base, chatId, query: 'travel' });
    expect(all).toEqual({ seqs: [10, 12, 14], isCapped: false });
    const late = repo.listMatchingSeqs({
      ...base,
      chatId,
      query: 'travel',
      dateFromTsKey: Date.UTC(2026, 10, 17, 22, 3, 0) / 1000,
    });
    expect(late.seqs).toEqual([14]);
    const short = repo.listMatchingSeqs({ ...base, chatId, query: 'pl' });
    expect(short.seqs).toEqual([10, 12, 14]);
    expect(repo.listMatchingSeqs({ ...base, chatId, query: 'absent' }).seqs).toEqual([]);
    expect(
      repo.listMatchingSeqs({ ...base, chatId: asChatId('other-chat'), query: 'travel' }).seqs,
    ).toEqual([]);
  });

  it('caps the 1–2 char fallback at 500 and flags it', () => {
    seedTextRows(db, {
      chatId,
      importId: 'imp-n',
      prefix: 'cap-fp',
      seqStart: 100,
      count: 501,
      body: (i) => `zq ${i}`,
      tsLocal: (i) =>
        `2026-11-17T23:${String(Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}`,
    });
    const capped = repo.listMatchingSeqs({ ...base, chatId, query: 'zq' });
    // Navigation starts at the newest match, so the cap keeps the newest.
    expect(capped.seqs).toHaveLength(500);
    expect(capped.seqs[0]).toBe(101);
    expect(capped.seqs.at(-1)).toBe(600);
    expect(capped.isCapped).toBe(true);
  });
});

describe('repository contract: calendar days', () => {
  it('lists distinct days with messages as day numbers', () => {
    const dayOf = (y: number, m: number, d: number): number => Date.UTC(y, m - 1, d) / 86_400_000;
    for (const [seq, local, key] of [
      [20, '2026-12-01T08:00:00', Date.UTC(2026, 11, 1, 8) / 1000],
      [21, '2026-12-01T23:59:59', Date.UTC(2026, 11, 1, 23, 59, 59) / 1000],
      [22, '2027-01-05T00:00:00', Date.UTC(2027, 0, 5) / 1000],
    ] as const) {
      db.run(
        `INSERT INTO messages (id, chat_id, fingerprint, seq, ts_local, ts_key, author_id, kind, body, is_edited, extra_json, import_id)
         VALUES (NULL, ?, ?, ?, ?, ?, NULL, 'text', 'day row', 0, NULL, 'imp-n')`,
        [chatId, `day-fp-${String(seq)}`, seq, local, key],
      );
    }
    expect(repo.listMessageDays(chatId)).toEqual([
      dayOf(2026, 11, 17),
      dayOf(2026, 12, 1),
      dayOf(2027, 1, 5),
    ]);
    expect(repo.listMessageDays(asChatId('other-chat'))).toEqual([]);
  });
});
