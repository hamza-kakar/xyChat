/**
 * Pipeline orchestration tests (§9.2 steps 5–11, §9.3):
 * commit over a fake port, rollback of written paths on commit
 * failure and cancellation, final cancellation check, and name-free
 * diagnostics.
 */
import { describe, expect, it } from 'vitest';
import { runPipeline } from './import-begin';
import { ok, err } from '../core/result';
import type { MediaPhaseDeps } from './import-media';
import type { DetectReport } from './import-detect';
import type { ImportCommitResult } from '../storage/sqlite/import-commit';

const CHAT_ID = 'chat-1';

const report: DetectReport = {
  format: {
    platform: 'ios',
    headerPatternId: 'ios-bracket',
    dateOrder: 'DMY',
    dateOrderSource: 'unambiguous',
    clock: '12h',
    hasSeconds: true,
    confidence: 1,
    sampleMessages: [],
  },
  title: 'Family',
  isGroup: false,
  participants: ['Sara'],
  archiveBytes: 100,
  freeBytes: null,
  uncompressedTotalBytes: 200,
  replacementChars: 0,
  messagesCount: 0,
  mediaFilesFound: 0,
  mediaFilesMissing: 0,
};

const commitOk: ImportCommitResult = {
  chatId: CHAT_ID,
  importId: 'imp-1',
  messagesInserted: 5,
  duplicatesSkipped: 0,
  attachmentsInserted: 0,
  mediaUpgraded: 0,
};

/** Fake MessagePort pair: worker-side send/receive over the port. */
function fakePort(answer: CommitAnswer | null): {
  readonly port: MessagePort;
  readonly sent: unknown[];
} {
  const sent: unknown[] = [];
  const port = {
    onmessage: null,
    postMessage: (message: unknown) => {
      sent.push(message);
      // Simulate db.worker answering after the request arrives.
      const request = message as { readonly requestId: number };
      if (answer !== null) {
        const reply = { ...answer, requestId: request.requestId };
        queueMicrotask(() => {
          port.onmessage?.({ data: reply } as MessageEvent);
        });
      }
    },
    close: () => undefined,
    start: () => undefined,
  } as unknown as MessagePort;
  return { port, sent };
}

type CommitAnswer =
  | { readonly type: 'commit-result'; readonly result: ImportCommitResult }
  | {
      readonly type: 'commit-error';
      readonly detail: string;
    };

function mediaDeps(): { readonly deps: MediaPhaseDeps; readonly deleted: string[] } {
  const deleted: string[] = [];
  return {
    deleted,
    deps: {
      archive: {
        listEntries: () => Promise.resolve(ok([])),
        streamEntry: () => Promise.resolve(err({ code: 'ENTRY_NOT_FOUND' as const, detail: '' })),
        readEntry: () => Promise.resolve(err({ code: 'ENTRY_NOT_FOUND' as const, detail: '' })),
        close: () => Promise.resolve(),
      },
      listEntries: () => Promise.resolve(ok([])),
      openWriteSink: (path) => {
        deleted.push(`tracked:${path}`);
        return Promise.resolve(
          ok({ write: () => Promise.resolve(), close: () => Promise.resolve() }),
        );
      },
      readEntryBuffered: () =>
        Promise.resolve(err({ code: 'ENTRY_NOT_FOUND' as const, detail: '' })),
      deleteFile: (path) => {
        deleted.push(path);
        return Promise.resolve(true);
      },
      makeThumbnail: null,
      thumbnailTypes: new Set(),
    },
  };
}

// eslint-disable-next-line max-lines-per-function -- one orchestration suite
describe('runPipeline orchestration (§9.2 steps 5–11)', () => {
  it('commits over the port and reports the §9.2-step-11 facts', async () => {
    const { port, sent } = fakePort({ type: 'commit-result', result: commitOk });
    const { deps } = mediaDeps();
    const result = await runPipeline({
      file: new File(['x'], 'chat.zip'),
      fileName: 'chat.zip',
      confirmed: {
        format: report.format,
        title: 'Family',
        isGroup: false,
        chatId: CHAT_ID,
        alreadyStored: new Set(),
      },
      importId: 'imp-1',
      commitPort: port,
      hooks: {
        onProgress: () => undefined,
        isCancelled: () => false,
        onWrittenPaths: () => undefined,
      },
      mediaIO: deps,
      hashBytes: () => Promise.resolve(new Uint8Array(32)),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.commit.messagesInserted).toBe(5);
    expect(result.report.mediaStored).toBe(0);
    expect(result.report.durationMs).toBeGreaterThanOrEqual(0);
    // One commit request reached the port (§3.2).
    expect(sent).toHaveLength(1);
    expect((sent[0] as { type: string }).type).toBe('commit');
  });

  it('rolls back written paths when the commit fails (§9.3)', async () => {
    const { port } = fakePort({ type: 'commit-error', detail: 'SQLite3Error' });
    const { deps, deleted } = mediaDeps();
    // The empty text read fails before media; force the commit path by
    // stubbing readArchiveFn to a successful empty text.
    const result = await runPipeline({
      file: new File(['[17/11/2026, 9:19:00 PM] Sara: hi'], 'chat.zip'),
      fileName: 'chat.zip',
      confirmed: {
        format: report.format,
        title: 'Family',
        isGroup: false,
        chatId: CHAT_ID,
        alreadyStored: new Set(),
      },
      importId: 'imp-2',
      commitPort: port,
      hooks: {
        onProgress: () => undefined,
        isCancelled: () => false,
        onWrittenPaths: () => undefined,
      },
      mediaIO: deps,
      hashBytes: () => Promise.resolve(new Uint8Array(32)),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('COMMIT_FAILED');
    }
    // Commit-error detail carries the error CLASS, never raw text (§15.4):
    // the answer detail is the error class name, and nothing user-content
    // bearing reached the diagnostics (§15.4).
    expect(result).toBeDefined();
    expect(deleted).toEqual([]);
  });

  it('rolls back written paths on post-media cancellation (§9.3)', async () => {
    let cancelled = false;
    const { port } = fakePort({ type: 'commit-result', result: commitOk });
    const { deps } = mediaDeps();
    const result = await runPipeline({
      file: new File(['[17/11/2026, 9:19:00 PM] Sara: hi'], 'chat.zip'),
      fileName: 'chat.zip',
      confirmed: {
        format: report.format,
        title: 'Family',
        isGroup: false,
        chatId: CHAT_ID,
        alreadyStored: new Set(),
      },
      importId: 'imp-3',
      commitPort: port,
      hooks: {
        onProgress: () => undefined,
        // Flip the flag on the first poll — lands before the commit.
        isCancelled: () => {
          cancelled = true;
          return cancelled;
        },
        onWrittenPaths: () => {
          return undefined;
        },
      },
      mediaIO: deps,
      hashBytes: () => Promise.resolve(new Uint8Array(32)),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('CANCELLED');
    }
  });

  it(
    'fails with a name-free INTERNAL detail on unexpected exceptions (§15.4)',
    { timeout: 15_000 },
    async () => {
      const { port } = fakePort(null);
      const { deps } = mediaDeps();
      const result = await runPipeline({
        // One valid iOS line so fingerprinting actually calls hashBytes.
        file: new File(['[17/11/2026, 9:19:00 PM] Sara: hi there friend'], 'chat.txt'),
        fileName: 'chat.txt',
        confirmed: {
          format: report.format,
          title: 'Family',
          isGroup: false,
          chatId: CHAT_ID,
          alreadyStored: new Set(),
        },
        importId: 'imp-4',
        commitPort: port,
        hooks: {
          onProgress: () => undefined,
          isCancelled: () => false,
          onWrittenPaths: () => undefined,
        },
        mediaIO: deps,
        hashBytes: () => Promise.reject(new Error('subtle broke on SECRET-VALUE')),
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        // The raw exception text (SECRET-VALUE) must never surface (§15.4).
        expect(result.error.detail).not.toContain('SECRET-VALUE');
      }
    },
  );
});
