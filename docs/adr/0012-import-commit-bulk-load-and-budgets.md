# ADR 0012 — Import-commit bulk-load path and commit perf budgets

## Context

The review asked for a perf test committing a 100k-message re-import into a
chat with 100k stored messages, and a second case where the incoming
messages land early so every stored row must be renumbered — with a 2 s
budget in both cases. Measured on the real sqlite-wasm stack (Chromium,
in-memory DB, production SQL and schema):

| Path (100k rows)                              | Measured |
| --------------------------------------------- | -------- |
| Plain table inserts (no indexes beyond rowid) | ~2 s     |
| `messages` inserts with FTS sync triggers     | ~16 s    |
| `messages` inserts WITHOUT triggers           | ~7.6 s   |
| Trigram index backfill of 100k imported rows  | ~0.7 s   |
| Batched renumbering of 100k displaced rows    | ~2.0 s   |
| planMerge walk (200k entries)                 | ~0.2 s   |

The dominant cost is the §11 trigram FTS index: each message body yields
~38 index entries, and the per-row sync trigger machinery multiplies the
per-insert cost ~8×. No SQLite configuration changes this floor; the
trigram tokenizer and the §10.2 UNIQUE constraints/indexes are mandated by
the spec. A 2 s budget for a 100k insert + 100k renumber commit is
therefore not achievable with the specified design.

## Decision

1. **Bulk-load path inside the import commit** (import-commit-apply.ts):
   when messages will be inserted, the FTS sync triggers are dropped for
   the duration of the commit, messages insert via prepared statements
   (`SqliteDatabase.runEach` — the OO-API statement is prepared once and
   stepped per row; `exec()` re-parses the SQL text per call), and after
   the inserts the triggers are restored and the index is backfilled with
   ONE scoped statement over the import's own rows. All inside the commit
   transaction: a rollback restores the triggers atomically.
2. **Single DDL source**: the trigger SQL lives in
   `storage/sqlite/fts-triggers.ts`; migration 0001 applies the same
   constant, so the drop/restore path cannot drift from the schema.
3. **Budgets** (CI Chromium, commit-perf test):
   - Stable re-import (100k duplicates, no inserts, no renumbering): 2 s
     — measured ~1.6 s.
   - Displaced re-import (100k new + 100k renumbered): 20 s — measured
     ~14.3 s on the dev machine; headroom covers runner variance and is
     revisited if the CI runner proves faster.

## Alternatives considered

- Keeping per-row triggers and lowering to the measured ~16 s: strictly
  slower than the bulk-load path with no benefit.
- Full FTS `rebuild` after the bulk insert: correct but re-tokenizes the
  entire chat (measured ~1.3 s for 200k rows vs ~0.7 s scoped backfill).
- Relaxing or splitting the trigram index: rejected — §11 mandates trigram
  FTS for substring search in any script.
- Accepting per-row triggers with a bigger budget: wastes ~7 s of a
  user-visible import for no gain.

## Consequences

- Import commits are the ONLY code path that drops the triggers, always
  inside the commit transaction; every other code path (repository,
  rollback, delete) sees the triggers permanently installed.
- The §17 table has no commit budget of its own; these budgets live in the
  commit-perf test and this ADR, not in §17, and are flagged for review.
- If a future milestone changes the FTS schema, `fts-triggers.ts` is the
  one file to update.
