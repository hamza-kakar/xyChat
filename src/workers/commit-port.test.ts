/**
 * Commit-port dispatch tests (§3.2, §18.5): malformed or unknown messages
 * run no commit, invalid commit inputs are rejected before any SQL, and
 * answers carry only the error class name (§15.4).
 */
import { describe, expect, it, vi } from 'vitest';
import { handleCommitMessage, type CommitPortDeps } from './commit-port';
import type { ImportCommitResult } from '../storage/sqlite/import-commit';

const RESULT: ImportCommitResult = {
  chatId: 'chat-1',
  importId: 'imp-1',
  messagesInserted: 1,
  duplicatesSkipped: 0,
  attachmentsInserted: 0,
  mediaUpgraded: 0,
};

function validInput(): Record<string, unknown> {
  return {
    importId: 'imp-1',
    targetChatId: null,
    newChat: { title: 'Chat', isGroup: false, sourcePlatform: 'android', dateOrder: 'DMY' },
    messages: [
      {
        fingerprint: 'a'.repeat(32),
        message: {
          seq: 0,
          sourceLine: 1,
          timestamp: { year: 2026, month: 11, day: 17, hour: 21, minute: 0, second: 0 },
          author: 'Sara',
          kind: 'text',
          body: 'hello',
          isEdited: false,
          attachment: null,
          poll: null,
          location: null,
        },
      },
    ],
    attachments: [],
    fileName: 'chat.txt',
    fileBytes: 100,
    parserVersion: '1.0.0',
    report: { warningsByCode: {}, mediaStored: 0, mediaMissing: 0, mediaOmitted: 0, durationMs: 1 },
  };
}

function depsReturning(commit: CommitPortDeps['commit']): CommitPortDeps & {
  readonly commit: ReturnType<typeof vi.fn>;
} {
  return { commit: vi.fn(commit) };
}

describe('handleCommitMessage (§3.2)', () => {
  it.each([
    ['a non-object', 'commit'],
    ['an unknown type', { type: 'written-paths', requestId: 1, importId: 'imp-1', paths: [] }],
    ['a missing requestId', { type: 'commit', input: {} }],
    ['a string requestId', { type: 'commit', requestId: '1', input: {} }],
  ])('ignores %s without committing', (_label, raw) => {
    const deps = depsReturning(() => RESULT);
    expect(handleCommitMessage(deps, raw)).toBeNull();
    expect(deps.commit).not.toHaveBeenCalled();
  });

  it('rejects an invalid commit input before any commit runs', () => {
    const deps = depsReturning(() => RESULT);
    const answer = handleCommitMessage(deps, { type: 'commit', requestId: 7, input: { bad: 1 } });
    expect(answer).toEqual({ type: 'commit-error', requestId: 7, detail: 'INVALID_INPUT' });
    expect(deps.commit).not.toHaveBeenCalled();
  });

  it('answers a valid commit with its result', () => {
    const deps = depsReturning(() => RESULT);
    const answer = handleCommitMessage(deps, { type: 'commit', requestId: 3, input: validInput() });
    expect(answer).toEqual({ type: 'commit-result', requestId: 3, result: RESULT });
    expect(deps.commit).toHaveBeenCalledTimes(1);
  });

  it('reports a failed commit by error class only', () => {
    const deps = depsReturning(() => {
      const error = new Error('constraint failed on SECRET-VALUE');
      error.name = 'SQLite3Error';
      throw error;
    });
    const answer = handleCommitMessage(deps, { type: 'commit', requestId: 4, input: validInput() });
    expect(answer).toEqual({ type: 'commit-error', requestId: 4, detail: 'SQLite3Error' });
  });
});
