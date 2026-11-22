/**
 * Import-commit performance test (AGENTS.md §17, ADR 0012): committing a
 * 100k-message re-import into a chat that already stores 100k messages.
 * The stable case (all duplicates) budgets 2 s; the displaced case (every
 * stored row renumbered + 100k inserts) budgets 20 s — the measured floor
 * of the §11 trigram FTS and §10.2 indexes on sqlite-wasm, documented in
 * ADR 0012. Chromium-only per ADR 0007.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import initSqlite3 from '@sqlite.org/sqlite-wasm';
import { wrapDatabase, verifyFts5Trigram } from '../../src/storage/sqlite/open';
import { migrate } from '../../src/storage/sqlite/migrate';
import { commitImport, type ImportCommitInput } from '../../src/storage/sqlite/import-commit';
import type { ParsedMessage } from '../../src/core/model';
import type { ChatId } from '../../src/core/ids';
import { RUN_FACTS } from './contract-helpers';

const ROWS = 100_000;
/** Stable case: duplicates only — no inserts, no renumbering (ADR 0012). */
const BUDGET_MS = 2_000;
/** Displaced case: 100k inserts + 100k renumbered rows; measured floor of
 * the trigram FTS + schema indexes on sqlite-wasm (ADR 0012). */
const DISPLACED_BUDGET_MS = 20_000;

const BODIES: readonly string[] = [
  'plain text message body for the perf test',
  'a searchable needle hiding in row N',
  'common filler text without anything special',
];

let db: Awaited<ReturnType<typeof openDb>>;
let chatId: ChatId;

async function openDb() {
  const sqlite3 = await initSqlite3();
  // No 't' flag: tracing would print every statement through the browser
  // bridge and dominate the wall clock.
  const dbRaw = new sqlite3.oo1.DB({ filename: ':memory:', flags: 'c' });
  const db = wrapDatabase(dbRaw);
  db.exec('PRAGMA foreign_keys=ON; PRAGMA temp_store=MEMORY;');
  migrate(db);
  verifyFts5Trigram(db);
  return db;
}

/** Stored message N, identical to the incoming twin built by twinAt(). */
function storedRow(j: number): {
  fingerprint: string;
  body: string;
  tsLocal: string;
  tsKey: number;
} {
  const body = BODIES[j % BODIES.length] ?? '';
  const hour = 8 + (j % 12);
  const minute = j % 60;
  const tsLocal = `2026-11-17T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;
  return {
    fingerprint: `perf-fp-${j}`,
    body,
    tsLocal,
    tsKey: Date.UTC(2026, 10, 17, hour, minute, 0) / 1000,
  };
}

/** The incoming twin of stored row j — same timestamp so planMerge rule 1
 * (§8.10) aligns every pair at the heads. */
function twinAt(j: number): ParsedMessage {
  const row = storedRow(j);
  return {
    seq: j,
    sourceLine: j + 1,
    timestamp: { year: 2026, month: 11, day: 17, hour: 8 + (j % 12), minute: j % 60, second: 0 },
    author: 'Sara',
    kind: 'text',
    body: row.body,
    isEdited: false,
    attachment: null,
    poll: null,
    location: null,
  };
}

/** A brand-new message dated BEFORE the stored chat: every one of these
 * lands ahead of the stored rows in merge order. */
function newAt(j: number): ParsedMessage {
  return {
    seq: j,
    sourceLine: j + 1,
    timestamp: { year: 2026, month: 11, day: 16, hour: 8 + (j % 12), minute: j % 60, second: 0 },
    author: 'Sara',
    kind: 'text',
    body: `newly imported message ${j}`,
    isEdited: false,
    attachment: null,
    poll: null,
    location: null,
  };
}

/** Registers the in_progress import row for a commit input. */
function beginImport(id: string, fileName: string): void {
  db.run(
    `INSERT INTO imports (id, file_name, file_bytes, status, parser_version, started_at)
     VALUES (?, ?, 0, 'in_progress', '1.0.0', '2026-11-18T00:01:00Z')`,
    [id, fileName],
  );
}

/** Commit input for the displaced case: 100k new messages (dated BEFORE the
 * stored chat, so the plan emits them first) followed by the 100k twins. */
function supersetInput(importId: string, fileName: string): ImportCommitInput {
  return {
    importId,
    targetChatId: chatId,
    newChat: {
      title: 'ignored for merges',
      isGroup: false,
      sourcePlatform: 'android',
      dateOrder: 'DMY',
    },
    messages: [
      ...Array.from({ length: ROWS }, (_, j) => ({
        fingerprint: `perf-new-${j}`,
        message: newAt(j),
      })),
      ...Array.from({ length: ROWS }, (_, j) => ({
        fingerprint: `perf-fp-${j}`,
        message: twinAt(j),
      })),
    ],
    attachments: [],
    fileName,
    fileBytes: 10_000_000,
    parserVersion: '1.0.0',
    report: RUN_FACTS,
  };
}

/** Times one commitImport call against the §17 budget. */
function timedCommit(input: ImportCommitInput): {
  readonly result: ReturnType<typeof commitImport>;
  readonly elapsed: number;
} {
  const start = performance.now();
  const result = commitImport(db, input);
  return { result, elapsed: performance.now() - start };
}

/** Median of a non-empty list of timings. */
function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? Number.NaN;
}

/** Timed runs per idempotent case; the median damps runner noise (§17). */
const TIMED_RUNS = 3;

/** Asserts seqs are 0..n-1 with no gaps after the merge (§8.10). */
function assertNoSeqGaps(): void {
  const gaps = db.selectObjects(
    `SELECT COUNT(*) AS n FROM (SELECT seq, LAG(seq) OVER (ORDER BY seq) AS prev FROM messages WHERE chat_id = ?)
     WHERE prev IS NOT NULL AND seq != prev + 1`,
    [chatId],
  )[0]?.['n'];
  expect(gaps).toBe(0);
}

/** Asserts the chat aggregate row reports the expected message count. */
function assertChatCount(expected: number): void {
  const aggregates = db.selectObjects('SELECT message_count FROM chats WHERE id = ?', [chatId]);
  expect(aggregates[0]?.['message_count']).toBe(expected);
}

beforeEach(async () => {
  db = await openDb();
  chatId = 'perf-chat' as ChatId;
  db.run(
    `INSERT INTO imports (id, file_name, file_bytes, status, parser_version, started_at)
     VALUES ('perf-commit-1', 'perf.txt', 0, 'complete', '1.0.0', '2026-11-18T00:00:00Z')`,
  );
  db.run(
    `INSERT INTO chats (id, title, is_group, source_platform, date_order, message_count, created_at, updated_at)
     VALUES (?, 'Perf Chat', 0, 'android', 'DMY', 0, '2026-11-18T00:00:00Z', '2026-11-18T00:00:00Z')`,
    [chatId],
  );
  // Seed the stored chat: 100k messages in 500-row batched inserts.
  for (let i = 0; i < ROWS; i += 500) {
    const values: string[] = [];
    const params: (string | number | null)[] = [];
    for (let j = i; j < Math.min(i + 500, ROWS); j += 1) {
      const row = storedRow(j);
      values.push(`(NULL, ?, ?, ?, ?, ?, NULL, 'text', ?, 0, NULL, 'perf-commit-1')`);
      params.push(chatId, row.fingerprint, j, row.tsLocal, row.tsKey, row.body);
    }
    db.run(
      `INSERT INTO messages (id, chat_id, fingerprint, seq, ts_local, ts_key, author_id, kind, body, is_edited, extra_json, import_id)
       VALUES ${values.join(', ')}`,
      params,
    );
  }
});

describe('import-commit performance (§17, ADR 0007)', () => {
  // Test timeout > budget with headroom (§17; ADR 0012 for the floors).
  it('commits a 100k re-import into a 100k-message chat within budget', { timeout: 30_000 }, () => {
    beginImport('perf-commit-2', 'perf2.txt');
    const input: ImportCommitInput = {
      importId: 'perf-commit-2',
      targetChatId: chatId,
      newChat: {
        title: 'ignored for merges',
        isGroup: false,
        sourcePlatform: 'android',
        dateOrder: 'DMY',
      },
      messages: Array.from({ length: ROWS }, (_, j) => ({
        fingerprint: `perf-fp-${j}`,
        message: twinAt(j),
      })),
      attachments: [],
      fileName: 'perf2.txt',
      fileBytes: 10_000_000,
      parserVersion: '1.0.0',
      report: RUN_FACTS,
    };
    // One untimed warm-up, then the median of TIMED_RUNS identical
    // re-imports: each is idempotent, so every run does the same work.
    const { result } = timedCommit(input);
    const timings: number[] = [];
    for (let run = 0; run < TIMED_RUNS; run += 1) {
      const importId = `perf-commit-2-${run}`;
      beginImport(importId, 'perf2.txt');
      timings.push(timedCommit({ ...input, importId }).elapsed);
    }
    const elapsed = median(timings);

    expect(result.messagesInserted).toBe(0);
    expect(result.duplicatesSkipped).toBe(ROWS);
    expect(result.mediaUpgraded).toBe(0);
    assertNoSeqGaps();
    assertChatCount(ROWS);
    expect(
      elapsed,
      `commit ${ROWS}+${ROWS} took ${elapsed.toFixed(0)}ms (budget ${BUDGET_MS}ms)`,
    ).toBeLessThan(BUDGET_MS);
  });

  it(
    'commits a 100k superset landing early, displacing every stored row',
    { timeout: 30_000 },
    () => {
      // The incoming messages carry EARLIER timestamps than the stored chat, so
      // the plan emits them all first: every stored row moves by +ROWS and the
      // batched renumbering (§10.2 offset trick) is what gets timed.
      beginImport('perf-commit-3', 'perf3.txt');
      const { result, elapsed } = timedCommit(supersetInput('perf-commit-3', 'perf3.txt'));

      expect(result.messagesInserted).toBe(ROWS);
      expect(result.duplicatesSkipped).toBe(ROWS);
      // Every stored twin moved: perf-fp-0 sat at seq 0 and must sit at ROWS.
      const moved = db.selectObjects(
        'SELECT seq FROM messages WHERE chat_id = ? AND fingerprint = ?',
        [chatId, 'perf-fp-0'],
      );
      expect(moved[0]?.['seq']).toBe(ROWS);
      assertNoSeqGaps();
      assertChatCount(ROWS * 2);
      expect(
        elapsed,
        `commit ${ROWS} displaced +${ROWS} inserted took ${elapsed.toFixed(0)}ms (budget ${DISPLACED_BUDGET_MS}ms, ADR 0012)`,
      ).toBeLessThan(DISPLACED_BUDGET_MS);
    },
  );
});
