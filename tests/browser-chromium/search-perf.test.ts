/**
 * Search performance test (AGENTS.md §17, §22 M2): a search on 100k
 * messages must complete in ≤ 100 ms on CI Chromium. Uses in-memory
 * sqlite-wasm on the page (same SQL as production).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import initSqlite3 from '@sqlite.org/sqlite-wasm';
import { wrapDatabase, verifyFts5Trigram } from '../../src/storage/sqlite/open';
import { migrate } from '../../src/storage/sqlite/migrate';
import { SqliteChatRepository } from '../../src/storage/sqlite/sqlite-repository';
import type { ChatId } from '../../src/core/ids';

const ROWS = 100_000;
const BUDGET_MS = 100;

/** Deterministic 100k-row message set inserted with batched prepared runs. */
function seedRows(repo: SqliteChatRepository, chatId: string): void {
  const bodies: readonly string[] = [
    'plain text message body for the perf test',
    'a searchable needle hiding in row N',
    'common filler text without anything special',
  ];
  // Batched multi-row INSERTs: 500 rows per statement so the 100k seed
  // completes in seconds (FTS triggers still fire per row, but the
  // statement overhead is amortized).
  for (let i = 0; i < ROWS; i += 500) {
    const end = Math.min(i + 500, ROWS);
    const values: string[] = [];
    const params: (string | number | null)[] = [];
    for (let j = i; j < end; j += 1) {
      const body = bodies[j % bodies.length] ?? '';
      const tsLocal = `2026-11-17T${String(8 + (j % 12)).padStart(2, '0')}:${String(j % 60).padStart(2, '0')}:00`;
      const tsKey = Date.UTC(2026, 10, 17, 8 + (j % 12), j % 60, 0) / 1000;
      values.push(`(NULL, ?, ?, ?, ?, ?, NULL, 'text', ?, 0, NULL, 'perf-import')`);
      params.push(chatId, `perf-fp-${j}`, j, tsLocal, tsKey, body);
    }
    repo.database.run(
      `INSERT INTO messages (id, chat_id, fingerprint, seq, ts_local, ts_key, author_id, kind, body, is_edited, extra_json, import_id)
       VALUES ${values.join(', ')}`,
      params,
    );
  }
}

let repo: SqliteChatRepository;
let chatId: ChatId;

beforeEach(async () => {
  const sqlite3 = await initSqlite3();
  // No 't' flag: tracing would print every seeded statement through the
  // browser bridge and dominate the wall clock.
  const dbRaw = new sqlite3.oo1.DB({ filename: ':memory:', flags: 'c' });
  const db = wrapDatabase(dbRaw);
  db.exec('PRAGMA foreign_keys=ON; PRAGMA temp_store=MEMORY;');
  migrate(db);
  verifyFts5Trigram(db);
  repo = new SqliteChatRepository(db);
  chatId = 'perf-chat' as ChatId;
  db.run(
    `INSERT INTO imports (id, file_name, file_bytes, status, parser_version, started_at)
     VALUES ('perf-import', 'perf.txt', 0, 'complete', '1.0.0', '2026-11-18T00:00:00Z')`,
  );
  db.run(
    `INSERT INTO chats (id, title, is_group, source_platform, date_order, message_count, created_at, updated_at)
     VALUES (?, 'Perf Chat', 0, 'android', 'DMY', 0, '2026-11-18T00:00:00Z', '2026-11-18T00:00:00Z')`,
    [chatId],
  );
  seedRows(repo, chatId);
});

describe('search performance (§17, §22 M2)', () => {
  it('searches 100k messages in under 100 ms on Chromium', () => {
    const start = performance.now();
    const page = repo.search({
      chatId,
      query: 'needle',
      authorId: null,
      kinds: null,
      dateFromTsKey: null,
      dateToTsKey: null,
      limit: 50,
      cursor: null,
    });
    const elapsed = performance.now() - start;
    expect(page.hits.length).toBeGreaterThan(0);
    expect(
      elapsed,
      `search 100k took ${elapsed.toFixed(0)}ms (budget ${BUDGET_MS}ms)`,
    ).toBeLessThan(BUDGET_MS);
    // Budget enforcement is the expect() below; CI reads timings from the
    // vitest output via the assertion message.
  });
});
