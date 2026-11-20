/**
 * Repository contract: boot, import commit and media upgrades (§10.5,
 * §9.2, §8.10, §19.4). Runs SqliteChatRepository against the real
 * sqlite-wasm stack so v8 coverage instruments the storage layer.
 * Chromium-only per ADR 0007.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { commitImport } from '../../src/storage/sqlite/import-commit';
import { createImportRecord } from '../../src/storage/sqlite/import-record';
import { asChatId, type ChatId } from '../../src/core/ids';
import {
  msg,
  omittedMediaInput,
  openContractDb,
  presentMediaInput,
  recordInput,
  threeMsgInput,
} from './contract-helpers';
import type { SqliteDatabase } from '../../src/storage/sqlite/open';
import type { SqliteChatRepository } from '../../src/storage/sqlite/sqlite-repository';

let db: SqliteDatabase;
let repo: SqliteChatRepository;
let chatId: ChatId;

beforeEach(async () => {
  ({ db, repo } = await openContractDb());
});

afterEach(() => {
  db.close();
});

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
    expect(window.messages.map((m) => m.body)).toEqual([
      'hello world',
      'searchable needle here',
      'goodbye',
    ]);
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
});

describe('repository contract: merge plan (§8.10)', () => {
  it('interleaves a superset with new messages between stored ones', () => {
    createImportRecord(db, recordInput('imp-sup-1'));
    const first = commitImport(db, threeMsgInput('imp-sup-1', null));
    const localChat = asChatId(first.chatId);
    createImportRecord(db, recordInput('imp-sup-2'));
    const second = commitImport(db, {
      importId: 'imp-sup-2',
      targetChatId: localChat,
      newChat: { title: '', isGroup: false, sourcePlatform: 'android', dateOrder: 'DMY' },
      messages: [
        { fingerprint: 'fp-0', message: msg(0, 'hello world', 0) },
        { fingerprint: 'fp-B2', message: msg(1, 'B2 between', 1) },
        { fingerprint: 'fp-1', message: msg(2, 'searchable needle here', 2, 'Ali Khan') },
        { fingerprint: 'fp-2', message: msg(3, 'goodbye', 3) },
        { fingerprint: 'fp-D4', message: msg(4, 'D4 new', 4) },
      ],
      attachments: [],
      fileName: 'contract.txt',
      fileBytes: 100,
      parserVersion: '1.0.0',
    });
    expect(second.messagesInserted).toBe(2);
    expect(second.duplicatesSkipped).toBe(3);
    const window = repo.getMessageWindow({
      chatId: localChat,
      anchorSeq: 0,
      before: 10,
      after: 10,
    });
    expect(window.messages.map((m) => m.body)).toEqual([
      'hello world',
      'B2 between',
      'searchable needle here',
      'goodbye',
      'D4 new',
    ]);
    expect(window.messages.map((m) => m.seq)).toEqual([0, 1, 2, 3, 4]);
  });

  it('re-importing the identical file changes nothing', () => {
    createImportRecord(db, recordInput('imp-idem-1'));
    const first = commitImport(db, threeMsgInput('imp-idem-1', null));
    const localChat = asChatId(first.chatId);
    createImportRecord(db, recordInput('imp-idem-2'));
    const second = commitImport(db, threeMsgInput('imp-idem-2', localChat));
    expect(second.messagesInserted).toBe(0);
    expect(second.duplicatesSkipped).toBe(3);
  });
});

describe('repository contract: media upgrades', () => {
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
    expect(after[0]).toEqual({
      status: 'present',
      opfs_path: 'media/x/att-1.jpg',
      file_name: 'IMG-001.jpg',
      width: 100,
    });
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
