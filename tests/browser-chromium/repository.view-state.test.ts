/**
 * Repository contract: last chat position in `meta`, validated on
 * read. Chromium against real sqlite-wasm per ADR 0007.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { commitImport } from '../../src/storage/sqlite/import-commit';
import { createImportRecord } from '../../src/storage/sqlite/import-record';
import { getLastChatPosition, setLastChatPosition } from '../../src/storage/sqlite/view-state';
import { asChatId, type ChatId } from '../../src/core/ids';
import { openContractDb, recordInput, threeMsgInput } from './contract-helpers';
import type { SqliteDatabase } from '../../src/storage/sqlite/open';
import type { SqliteChatRepository } from '../../src/storage/sqlite/sqlite-repository';

let db: SqliteDatabase;
let repo: SqliteChatRepository;
let chatId: ChatId;

beforeEach(async () => {
  ({ db, repo } = await openContractDb());
  createImportRecord(db, recordInput('imp-v'));
  chatId = asChatId(commitImport(db, threeMsgInput('imp-v', null)).chatId);
});

afterEach(() => {
  db.close();
});

describe('repository contract: last chat position', () => {
  it('starts empty, stores, overwrites and clears', () => {
    expect(getLastChatPosition(db)).toBeNull();
    setLastChatPosition(db, { chatId, seq: 2 });
    expect(getLastChatPosition(db)).toEqual({ chatId, seq: 2 });
    setLastChatPosition(db, { chatId, seq: 0 });
    expect(getLastChatPosition(db)).toEqual({ chatId, seq: 0 });
    setLastChatPosition(db, null);
    expect(getLastChatPosition(db)).toBeNull();
  });

  it('reads an invalid stored value as no position', () => {
    db.run("INSERT INTO meta (key, value) VALUES ('last_chat_position', '{not json')");
    expect(getLastChatPosition(db)).toBeNull();
    db.run(
      'UPDATE meta SET value = \'{"chatId":"x","seq":-1}\' WHERE key = \'last_chat_position\'',
    );
    expect(getLastChatPosition(db)).toBeNull();
  });

  it('forgets the position once its chat is deleted', () => {
    setLastChatPosition(db, { chatId, seq: 1 });
    repo.deleteChat(chatId);
    expect(getLastChatPosition(db)).toBeNull();
  });

  it('reads each message with the import that stored it', () => {
    const window = repo.getMessageWindow({ chatId, anchorSeq: 0, before: 0, after: 5 });
    expect(window.messages.map((m) => m.importId)).toEqual(['imp-v', 'imp-v', 'imp-v']);
  });
});
