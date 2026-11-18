/**
 * Repository contract test (AGENTS.md §10.5, §19.1): exercises the REAL
 * sqlite-wasm + OPFS stack through db.worker — open, migrate, commit,
 * read, search, delete. Runs on Chromium; WebKit skips on engines without
 * OPFS per ADR 0007 (ratified: decided at M2).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { ensureDbReady, resetDbClientForTests, dbClient } from '../../src/client/db-client';
import type { ImportCommitInput } from '../../src/storage/sqlite/import-commit';
import type { ParsedMessage } from '../../src/core/model';

/** True when the engine supports OPFS (WebKit on Linux does not, ADR 0007). */
function engineHasOpfs(): boolean {
  try {
    return typeof navigator.storage.getDirectory === 'function';
  } catch {
    return false;
  }
}

beforeEach(() => {
  resetDbClientForTests();
});

function msg(
  seq: number,
  body: string,
  minute: number,
): { fingerprint: string; message: ParsedMessage } {
  const message: ParsedMessage = {
    seq,
    sourceLine: seq + 1,
    timestamp: { year: 2026, month: 11, day: 17, hour: 21, minute, second: 0 },
    author: 'Person A',
    kind: 'text',
    body,
    isEdited: false,
    attachment: null,
    poll: null,
    location: null,
  };
  return { fingerprint: `${seq}-${body}`, message };
}

function commitInput(importId: string): ImportCommitInput {
  return {
    importId,
    targetChatId: null,
    newChat: {
      title: 'Contract Test Chat',
      isGroup: false,
      sourcePlatform: 'android',
      dateOrder: 'DMY',
    },
    messages: [msg(0, 'hello world', 0), msg(1, 'searchable needle here', 1), msg(2, 'goodbye', 2)],
    attachments: [],
    fileName: 'contract.txt',
    fileBytes: 100,
    parserVersion: '1.0.0',
  };
}

describe('repository contract (real sqlite-wasm + OPFS)', () => {
  it('opens, migrates and verifies FTS5 through db.worker', async (ctx) => {
    if (!engineHasOpfs()) {
      ctx.skip();
      return;
    }
    expect(await ensureDbReady()).toBe(true);
  });

  it('commits an import and reads it back', async (ctx) => {
    if (!engineHasOpfs()) {
      ctx.skip();
      return;
    }
    expect(await ensureDbReady()).toBe(true);
    const result = await dbClient.commitImport(commitInput('22222222-2222-4222-8222-222222222222'));
    expect(result.messagesInserted).toBe(3);
    expect(result.duplicatesSkipped).toBe(0);

    const chats = await dbClient.listChats();
    const chat = chats.find((c) => c.title === 'Contract Test Chat');
    expect(chat?.messageCount).toBe(3);

    if (chat !== undefined) {
      const window = await dbClient.getMessageWindow({
        chatId: chat.id,
        anchorSeq: 1,
        before: 5,
        after: 5,
      });
      expect(window.messages.map((m) => m.body)).toEqual([
        'hello world',
        'searchable needle here',
        'goodbye',
      ]);
      const search = await dbClient.search({
        chatId: null,
        query: 'needle',
        authorId: null,
        kinds: null,
        dateFromTsKey: null,
        dateToTsKey: null,
        limit: 50,
        cursor: null,
      });
      expect(search.hits).toHaveLength(1);
      expect(search.hits[0]?.snippet).toContain('needle');
      await dbClient.deleteChat(chat.id);
      expect((await dbClient.listChats()).find((c) => c.id === chat.id)).toBeUndefined();
    }
  });

  it('skips duplicates when the same fingerprint is committed twice', async (ctx) => {
    if (!engineHasOpfs()) {
      ctx.skip();
      return;
    }
    expect(await ensureDbReady()).toBe(true);
    const first = await dbClient.commitImport(commitInput('33333333-3333-4333-8333-333333333333'));
    expect(first.messagesInserted).toBe(3);
    const second = await dbClient.commitImport({
      ...commitInput('44444444-4444-4444-8444-444444444444'),
      targetChatId: first.chatId,
    });
    expect(second.messagesInserted).toBe(0);
    expect(second.duplicatesSkipped).toBe(3);
    // Cleanup
    const chats = await dbClient.listChats();
    const chat = chats.find((c) => c.title === 'Contract Test Chat');
    if (chat !== undefined) {
      await dbClient.deleteChat(chat.id);
    }
  });
});
