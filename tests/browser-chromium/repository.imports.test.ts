/**
 * Repository contract: import bookkeeping (§9.3, §10.5). Status changes
 * apply only from in_progress, written-path lists round-trip and survive
 * corruption, and media path reads serve the skip and delete flows.
 * Chromium against real sqlite-wasm per ADR 0007.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { commitImport } from '../../src/storage/sqlite/import-commit';
import { createImportRecord } from '../../src/storage/sqlite/import-record';
import { asChatId } from '../../src/core/ids';
import { openContractDb, presentMediaInput, recordInput } from './contract-helpers';
import type { SqliteDatabase } from '../../src/storage/sqlite/open';
import type { SqliteChatRepository } from '../../src/storage/sqlite/sqlite-repository';

let db: SqliteDatabase;
let repo: SqliteChatRepository;

beforeEach(async () => {
  ({ db, repo } = await openContractDb());
});

afterEach(() => {
  db.close();
});

function statusOf(importId: string): unknown {
  return db.selectObjects('SELECT status FROM imports WHERE id = ?', [importId])[0]?.['status'];
}

describe('repository contract: import status transitions (§9.3)', () => {
  it.each([
    [
      'cancelled',
      (id: string): void => {
        repo.markImportCancelled(id);
      },
    ],
    [
      'failed',
      (id: string): void => {
        repo.markImportFailed(id);
      },
    ],
  ] as const)('moves an in_progress import to %s', (status, mark) => {
    createImportRecord(db, recordInput('imp-t'));
    mark('imp-t');
    expect(statusOf('imp-t')).toBe(status);
  });

  it('never changes a finished import', () => {
    createImportRecord(db, recordInput('imp-done'));
    commitImport(db, presentMediaInput('imp-done', null));
    expect(statusOf('imp-done')).toBe('complete');

    repo.markImportCancelled('imp-done');
    repo.markImportFailed('imp-done');
    expect(statusOf('imp-done')).toBe('complete');
  });

  it('does not let a later mark override cancelled', () => {
    createImportRecord(db, recordInput('imp-c'));
    repo.markImportCancelled('imp-c');
    repo.markImportFailed('imp-c');
    expect(statusOf('imp-c')).toBe('cancelled');
  });
});

describe('repository contract: written paths (§9.2 step 8, §9.3)', () => {
  it('round-trips the cumulative list and hands it to boot rollback', () => {
    createImportRecord(db, recordInput('imp-w'));
    repo.recordWrittenPaths('imp-w', ['media/c/a.jpg']);
    repo.recordWrittenPaths('imp-w', ['media/c/a.jpg', 'thumbs/c/a.jpg']);

    expect(repo.rollbackInProgressImports()).toEqual(['media/c/a.jpg', 'thumbs/c/a.jpg']);
    expect(statusOf('imp-w')).toBe('rolled_back');
  });

  it('treats a corrupt list as empty instead of failing boot', () => {
    createImportRecord(db, recordInput('imp-bad'));
    db.run("UPDATE imports SET written_paths_json = '{not json' WHERE id = 'imp-bad'");

    expect(repo.rollbackInProgressImports()).toEqual([]);
    expect(statusOf('imp-bad')).toBe('rolled_back');
  });
});

describe('repository contract: media path reads (§9.2 step 8, §10.4)', () => {
  it('lists stored fingerprints and the chat media paths', () => {
    createImportRecord(db, recordInput('imp-m'));
    const chatId = asChatId(commitImport(db, presentMediaInput('imp-m', null)).chatId);

    expect(repo.listStoredFingerprints(chatId)).toEqual(['fp-om']);
    expect(repo.listChatMediaPaths(chatId)).toEqual(['media/x/att-1.jpg']);
    expect(repo.listOrphanMedia(['media/x/att-1.jpg', 'media/x/stray.jpg'])).toEqual([
      'media/x/stray.jpg',
    ]);
  });
});

describe('repository contract: import history reports (§9.2 step 11, §12.7)', () => {
  it('stores the run facts with the commit counts and reads them back', () => {
    createImportRecord(db, recordInput('imp-r1'));
    const first = presentMediaInput('imp-r1', null);
    const chatId = asChatId(
      commitImport(db, {
        ...first,
        report: { ...first.report, warningsByCode: { INVALID_DATE: 2 }, mediaStored: 1 },
      }).chatId,
    );
    createImportRecord(db, recordInput('imp-r2'));
    commitImport(db, presentMediaInput('imp-r2', chatId));

    const history = repo.listImports(chatId);
    expect(history.map((record) => record.id)).toContain('imp-r1');
    const firstRecord = history.find((record) => record.id === 'imp-r1');
    expect(firstRecord?.report).toEqual({
      warningsByCode: { INVALID_DATE: 2 },
      mediaStored: 1,
      mediaMissing: 0,
      mediaOmitted: 0,
      durationMs: 1,
      messagesAdded: first.messages.length,
      duplicatesSkipped: 0,
      mediaUpgraded: 0,
    });
    const second = history.find((record) => record.id === 'imp-r2');
    expect(second?.report?.messagesAdded).toBe(0);
    expect(second?.report?.duplicatesSkipped).toBe(first.messages.length);
  });

  it('reads a missing or corrupt report as null', () => {
    createImportRecord(db, recordInput('imp-r3'));
    const chatId = asChatId(commitImport(db, presentMediaInput('imp-r3', null)).chatId);
    db.run("UPDATE imports SET report_json = '{\"messagesAdded\":-1}' WHERE id = 'imp-r3'");
    expect(repo.listImports(chatId)[0]?.report).toBeNull();
    db.run("UPDATE imports SET report_json = 'not json' WHERE id = 'imp-r3'");
    expect(repo.listImports(chatId)[0]?.report).toBeNull();
  });
});
