/**
 * Shared fixtures for the repository contract tests (§10.5): database
 * bootstrap and commit-input builders. Not a test file — imported by the
 * *.test.ts modules in this directory.
 */
import initSqlite3 from '@sqlite.org/sqlite-wasm';
import {
  wrapDatabase,
  verifyFts5Trigram,
  type SqliteDatabase,
} from '../../src/storage/sqlite/open';
import { migrate } from '../../src/storage/sqlite/migrate';
import { SqliteChatRepository } from '../../src/storage/sqlite/sqlite-repository';
import type { ImportCommitInput } from '../../src/storage/sqlite/import-commit';
import type { ParsedMessage } from '../../src/core/model';
import type { ImportRunFacts } from '../../src/storage/sqlite/import-report';

/** Run facts for commits made by tests (§9.2 step 11 report). */
export const RUN_FACTS: ImportRunFacts = {
  warningsByCode: {},
  mediaStored: 0,
  mediaMissing: 0,
  mediaOmitted: 0,
  durationMs: 1,
};

export interface ContractDb {
  readonly db: SqliteDatabase;
  readonly repo: SqliteChatRepository;
}

/** Opens a fresh in-memory sqlite-wasm database, migrated and FTS5-verified. */
export async function openContractDb(): Promise<ContractDb> {
  const sqlite3 = await initSqlite3();
  const dbRaw = new sqlite3.oo1.DB({ filename: ':memory:', flags: 'c' });
  const db = wrapDatabase(dbRaw);
  db.exec('PRAGMA foreign_keys=ON; PRAGMA temp_store=MEMORY;');
  migrate(db);
  verifyFts5Trigram(db);
  return { db, repo: new SqliteChatRepository(db) };
}

/** Import-row input for the contract fixtures. */
export function recordInput(importId: string): {
  importId: string;
  fileName: string;
  fileBytes: number;
  parserVersion: string;
} {
  return { importId, fileName: 'contract.txt', fileBytes: 100, parserVersion: '1.0.0' };
}

/** A plain text message at 21:<minute> on 2026-11-17. */
export function msg(seq: number, body: string, minute: number, author = 'Sara'): ParsedMessage {
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

/** A media message whose attachment is omitted or referenced. */
export function mediaMsg(
  seq: number,
  body: string,
  minute: number,
  status: 'omitted' | 'referenced',
): ParsedMessage {
  return {
    seq,
    sourceLine: seq + 1,
    timestamp: { year: 2026, month: 11, day: 17, hour: 21, minute, second: 0 },
    author: 'Sara',
    kind: 'media',
    body,
    isEdited: false,
    attachment: {
      fileName: status === 'referenced' ? 'IMG-001.jpg' : null,
      mediaType: 'image',
      status,
    },
    poll: null,
    location: null,
  };
}

/** The three-message import used across the suites. */
export function threeMsgInput(importId: string, chatIdToTarget: string | null): ImportCommitInput {
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
    report: RUN_FACTS,
  };
}

/** Import of a media message whose bytes are NOT in the archive. */
export function omittedMediaInput(
  importId: string,
  chatIdToTarget: string | null,
): ImportCommitInput {
  return {
    importId,
    targetChatId: chatIdToTarget,
    newChat: { title: 'Media Chat', isGroup: false, sourcePlatform: 'android', dateOrder: 'DMY' },
    messages: [{ fingerprint: 'fp-om', message: mediaMsg(0, 'photo message', 0, 'omitted') }],
    attachments: [
      {
        id: 'att-om',
        fingerprintOfMessage: 'fp-om',
        fileName: null,
        mediaType: 'image',
        mime: 'image/jpeg',
        byteSize: null,
        opfsPath: null,
        thumbPath: null,
        width: null,
        height: null,
        durationMs: null,
        status: 'omitted',
      },
    ],
    fileName: 'media.txt',
    fileBytes: 50,
    parserVersion: '1.0.0',
    report: RUN_FACTS,
  };
}

/** Re-import of the same media message WITH bytes (upgrade path, §8.10). */
export function presentMediaInput(
  importId: string,
  chatIdToTarget: string | null,
): ImportCommitInput {
  return {
    importId,
    targetChatId: chatIdToTarget,
    newChat: { title: 'Media Chat', isGroup: false, sourcePlatform: 'android', dateOrder: 'DMY' },
    messages: [{ fingerprint: 'fp-om', message: mediaMsg(0, 'photo message', 0, 'referenced') }],
    attachments: [
      {
        id: 'att-p',
        fingerprintOfMessage: 'fp-om',
        fileName: 'IMG-001.jpg',
        mediaType: 'image',
        mime: 'image/jpeg',
        byteSize: 500,
        opfsPath: 'media/x/att-1.jpg',
        thumbPath: null,
        width: 100,
        height: 80,
        durationMs: null,
        status: 'present',
      },
    ],
    fileName: 'media.txt',
    fileBytes: 50,
    parserVersion: '1.0.0',
    report: RUN_FACTS,
  };
}

/** Seeding specification for seedTextRows. */
export interface SeedSpec {
  readonly chatId: string;
  readonly importId: string;
  readonly prefix: string;
  readonly seqStart: number;
  readonly count: number;
  readonly body: (index: number) => string;
  readonly tsLocal: (index: number) => string;
}

/** Batch-inserts plain text messages with generated fingerprints/seqs. */
export function seedTextRows(db: SqliteDatabase, spec: SeedSpec): void {
  const rows: string[] = [];
  const params: (string | number | null)[] = [];
  for (let i = 0; i < spec.count; i += 1) {
    rows.push(`(NULL, ?, ?, ?, ?, ?, NULL, 'text', ?, 0, NULL, ?)`);
    const local = spec.tsLocal(i);
    const parts = local.split('T')[1]?.split(':') ?? [];
    const tsKey =
      Date.UTC(2026, 10, 17, Number(parts[0] ?? 0), Number(parts[1] ?? 0), Number(parts[2] ?? 0)) /
      1000;
    params.push(
      spec.chatId,
      `${spec.prefix}-${i}`,
      spec.seqStart + i,
      local,
      tsKey,
      spec.body(i),
      spec.importId,
    );
  }
  db.run(
    `INSERT INTO messages (id, chat_id, fingerprint, seq, ts_local, ts_key, author_id, kind, body, is_edited, extra_json, import_id)
     VALUES ${rows.join(', ')}`,
    params,
  );
}
