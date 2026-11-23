/**
 * Repository contract: chat management — self, rename, bookmarks, imports,
 * rollback, delete cascade. Chromium against real sqlite-wasm
 * per ADR 0007.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { commitImport } from '../../src/storage/sqlite/import-commit';
import { createImportRecord } from '../../src/storage/sqlite/import-record';
import { asChatId, type ChatId } from '../../src/core/ids';
import { openContractDb, recordInput, threeMsgInput } from './contract-helpers';
import type { SqliteDatabase } from '../../src/storage/sqlite/open';
import type { SqliteChatRepository } from '../../src/storage/sqlite/sqlite-repository';

let db: SqliteDatabase;
let repo: SqliteChatRepository;
let chatId: ChatId;

beforeEach(async () => {
  ({ db, repo } = await openContractDb());
  createImportRecord(db, recordInput('imp-m'));
  const result = commitImport(db, threeMsgInput('imp-m', null));
  chatId = asChatId(result.chatId);
});

afterEach(() => {
  db.close();
});

describe('repository contract: chat management', () => {
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
    expect(bookmarkId).not.toBeNull();
    if (bookmarkId === null) return;
    repo.updateBookmark(bookmarkId, 'edited note');
    const bookmarks = repo.listBookmarks(chatId);
    expect(bookmarks).toHaveLength(1);
    expect(bookmarks[0]?.bookmark.note).toBe('edited note');
    expect(bookmarks[0]?.message.body).toBe(message.body);
    expect(bookmarks[0]?.message.authorName).toBe(message.authorName);
    expect(repo.listBookmarks(null)).toHaveLength(1);
    repo.removeBookmark(bookmarkId);
    expect(repo.listBookmarks(chatId)).toHaveLength(0);
  });

  it('keeps one bookmark per message and rejects a message from another chat', () => {
    const window = repo.getMessageWindow({ chatId, anchorSeq: 0, before: 0, after: 1 });
    const message = window.messages[0];
    expect(message).toBeDefined();
    if (message === undefined) return;
    const first = repo.addBookmark(chatId, message.rowId, null);
    const second = repo.addBookmark(chatId, message.rowId, 'second note');
    expect(second).toBe(first);
    expect(repo.listBookmarks(chatId).map((view) => view.bookmark.note)).toEqual(['second note']);
    expect(repo.addBookmark(asChatId('other-chat'), message.rowId, null)).toBeNull();
    expect(repo.listBookmarks(null)).toHaveLength(1);
  });

  it('lists import history and storage usage', () => {
    const imports = repo.listImports(chatId);
    expect(imports).toHaveLength(1);
    expect(imports[0]?.status).toBe('complete');
    expect(imports[0]?.parserVersion).toBe('1.0.0');
    expect(repo.storageUsage().totalBytes).toBe(0);
  });

  it('rolls back in_progress imports', () => {
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
