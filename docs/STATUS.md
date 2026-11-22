# Status

Progress tracker for waChatBack. Updated in every PR.

## Current milestone

M3 — import pipeline (PR #6, round-2 feedback being addressed).

M2 — Storage and db.worker: merged.

### Round-2 fixes landed (2026-11-22)

- Media phase (§9.3): every path is recorded and flushed before its file
  is created; chunk writes are awaited and short writes detected; a throw
  mid-entry becomes a typed error with every touched path deleted; the
  pipeline shares the written-path list so its catch can roll back too.
- Thumbnails (§9.4): entries over `IMPORT_LIMITS.maxThumbnailSourceBytes`
  (50 MiB) get none; both phase bars are determinate (§9.1).
- `deleteChatMedia` counts only the removed chat's files; the orphan-sweep
  suite cleans OPFS after each test (fixes the CI browser failure).
- Corrupt `written_paths_json` reads as an empty list instead of throwing.

Also landed:

- db.worker holds no SQL: import marks, written paths, attachment and
  chat-path reads go through repository methods with Valibot-validated
  rows; contract tests cover the in_progress-only transitions and corrupt
  path lists; commit-port dispatch has unit tests.
- E2E flow 4 uses a true superset (6 stored + 2 new); flow 5 cancels only
  once media files exist and fails if rollback skips the deletes.
- The import flow hook lives in `features/import/hooks/`, owns cancel,
  and requests persistent storage once, only when not already persisted.
- The stable commit perf case times the median of 3 runs after a warm-up.

Round-3 fixes:

- Written paths are flushed to the imports row every 100 paths and once
  when the media phase ends or fails, not on every file (§9.2 step 8).
  After a crash, at most 99 unflushed files are left for the orphan
  sweeper.
- Cancel waits for the worker's CANCELLED answer instead of flashing the
  picker first. E2E flow 5 then re-picks the export and checks no
  "Update existing chat" option appears, so no chat was created.
- Wake-lock tests cover a lock granted after the progress step unmounts.

Round-4 fix:

- Tapping Cancel disables the button and shows "Cancelling…" until the
  worker answers. If the import committed before the worker saw the
  cancel, the report says it finished before it could be cancelled.

Known limits: message order after a superset merge is asserted by the
browser contract test, not E2E, until the chat view lands (M4). The two
perf tests can exceed budget when suites run in parallel on one machine;
serial runs and CI pass.

## What's done (M3)

- Archive reading with §15.2 safety (ratio/entry caps, quota check,
  traversal rejection) — archive-reader.ts + opened-archive.ts (streaming
  handle, review Major 9) + 15 node tests.
- Detection + confirmation (§9.2 step 4, §12.8.4): DetectReport with
  participants/group/title/media counts/free bytes; DMY/MDY override
  re-runs detection.
- Parse + §8.10 fingerprints (§9.2 steps 6–7) with §8.2 progress and §9.3
  cancellation polling per 1,000 items.
- Media phase (§9.2 steps 8–9): STREAMED writes through opened-archive
  sync-handle sinks (review Major 9 — nothing buffered whole), thumbnails
  with determinate §9.1 progress, skip-stored fingerprints (§9.2 step 8),
  §9.3 rollback of exactly the written paths.
- Commit over the §3.2 MessagePort (commit-port.ts page module, Valibot
  union validation); markImport* via repository methods; import-begin.ts
  page module owns the orchestration incl. post-media rollback (review
  Majors 6/7/8).
- Import UI (§12.8): install gate with bypass, picker, confirm (DMY/MDY
  toggle, self choice, merge preselect, summary with archive/free-storage
  bytes), progress (§9.1 phases + wake lock §12.8.5 + cancel), report
  (media split, plain-language warnings), mapped errors with safe
  diagnostics (§15.4).
- §22 M3 scale gate: 100k messages + 2k media imported without memory
  errors (browser test); e2e flows 2–5 on Chromium (WebKit skips per ADR
  0007).

## Previously (M2)

- sqlite-wasm + opfs-sahpool in db.worker behind a typed wrapper
  (§10.1 pragmas: journal_mode=DELETE, foreign_keys, synchronous,
  temp_store, cache_size); single-instance navigator.locks probe.
- Migration framework (§10.3) + 0001_init schema (§10.2): STRICT tables,
  FTS5 trigram external-content index with sync triggers, §11 indexes.
- Rows validated at the boundary with Valibot (§18.5), snake→camel
  mapping per table.
- SqliteChatRepository: chat list/participants/windows (with
  attachments), findSeqByDate, search (FTS phrase + LIKE fallback, keyset
  paging, ±40 snippets), attachment + links pages, chat stats, self/
  rename/delete, bookmarks, import history, storage usage.
- Transactional import commit (§9.2 step 10): import row, chat
  upsert/create, deterministic participant ids + §10.2 palette hash,
  occurrence-counted fingerprints, duplicate skip, attachments, +1e9 seq
  renumber trick, in-transaction aggregates.
- db.worker over Comlink with typed DbApi; INTERNAL error serialization
  (§18.7); boot rollback of in_progress imports (§9.3). db-client on the
  main thread (§3.1 layer-clean, no app imports in workers).
- FTS5-trigram probe wired into the boot gate via ready() (ADR 0008
  ratified): db.worker open failure renders the unsupported screen.
- OPFS media-store (§10.4): canonical paths, sync-access-handle writes,
  async reads, recursive chat-media delete, orphan path listing.
- Browser-mode contract tests (§10.5): open/migrate/FTS5, commit+read+
  search+delete round-trip, duplicate-skip re-import merge — green on
  Chromium; WebKit leg runs in CI (dev machine lacks system libs).

## Previously (M1)

- `core/` complete per §6–§8: Result, branded ids, domain model,
  LocalDateTime (UTC-trick formatting, canonical form, tsKey), the four
  header grammars with locale tables (en), detectFormat (evidence-based
  grammar vote, date-order resolution with conflict detection, preview
  sample), line assembly (continuations, orphan/invalid-date/
  out-of-order warnings, progress events), classification (system-before-
  split, attachments, omitted placeholders, locations, polls, calls,
  deleted/edited), attachment media typing + static MIME table,
  fingerprinting (injected SHA-256, pure-TS UTF-8), planMerge (§8.10
  rules 1–3), chat metadata, WhatsApp text-format tokenizer.
- 29 golden fixtures (§19.2) generated with an expectation-guarded
  script; fixture runner pins parser output to committed expected.json.
- Property tests (§19.2): never-throws, line accounting, round-trip,
  fingerprint determinism, merge idempotency/order/losslessness, tokenizer
  leaf preservation, locale-regex timing budget.
- Perf gate: 100k-message parse in ~1.2–1.4 s (budget 2 s) via
  scripts/perf-check.ts in the CI perf job.
- Anonymizer (§19.3): parse-rebuild approach, Person A/B mapping
  (including system-event actors), same-length pseudo-words, marker
  vocabulary and file names preserved; CLI + unit tests.
- docs/EXPORT-FORMATS.md evidence log.

## Previously (M0)

- Repository initialized; spec (`AGENTS.md`) committed at the repo root and
  adopted as the source of truth.
- App named **waChatBack** (owner rename; single `APP_NAME` constant in
  `src/app/app-name.ts`, interpolated into i18n strings and injected into
  `index.html` at build time).
- Vite + React + TypeScript (strict) scaffold with the layer layout from §3.1.
- Tailwind CSS v4 design tokens: single-source dark palette primitives,
  applied via `prefers-color-scheme` (plus a `data-theme` hook for the M7
  manual override); WCAG-AA contrast verified by unit test for **both**
  palettes.
- App shell: error boundary, boot capability check (single cached worker
  probe, 5 s timeout, bounded boot), structured local logger (ring buffer,
  no-template-literal lint rule), minimal home screen.
- PWA manifest + service worker (prompt registration), generated original
  icons (`scripts/generate-icons.ts`, pure Node PNG encoder). Installability
  gated by `tests/e2e/manifest.spec.ts` (ADR 0009).
- Tooling: ESLint (strictTypeChecked, zero warnings), Prettier,
  dependency-cruiser layer rules, size-limit (**gzip** budgets per §17),
  LHCI, lefthook (Prettier incl. ts/tsx), Vitest (node / happy-dom /
  browser configs), Playwright (iPhone 13 WebKit + Pixel 7 Chromium).
- CI (9 jobs, SHA-pinned actions), GitHub Pages deploy (gated on CI success),
  release-please (node type + config/manifest files), Renovate, PR template.
- ADRs 0001–0009.

## Verified results (round-1 feedback rework)

- Unit + component: **42 passed** (node TZ matrix runs in CI).
- Coverage: `app/**` ≥ 70% lines (threshold enforced via `pnpm
test:coverage` in the unit job); overall 60% lines — `platform/capabilities.ts`
  real probes need a browser environment and are exercised by e2e; the
  probe/override seams are unit-tested with substituted probes.
- E2E (Chromium, Pixel 7 profile, production build): **8 passed, 0 skipped,
  0 flaky across 3 consecutive runs** — boot, axe light + dark (dark palette
  actually applied: `--surface` asserted `#101413`), offline reload,
  manifest installability, CSP violations zero in every flow. WebKit runs
  the same flows, asserting the unsupported screen where the capability gate
  refuses (ADR 0007); the offline flow is the only OPFS-conditional skip.
- Bundle (gzip, §17 budgets 170/25): JS **83.92 kB**, CSS **3.34 kB**.
- `pnpm audit --prod --audit-level=high`: no known vulnerabilities.
- LHCI: performance / a11y / best-practices budgets enforced in CI.

## What's next

- M3 — import pipeline (§9, §12.8): COMPLETE on branch m3-import (8
  ordered commits, each passing typecheck + tests). **One PR, not
  sub-PRs** — owner decision (2026-11-20), an explicit exception to §0
  rule 12; reviewability kept via the ordered commit structure.
  Acceptance: e2e flows 2–5 pass on Chromium (WebKit skips per ADR
  0007); the §22 scale gate imports a 100k-message + 2k-media synthetic
  zip in CI Chromium without memory errors. Commit map (§9/§12.8 →
  commits) lives in the PR description.

## Verified results (M2 + audit rounds 2–3)

- Import-commit perf (ADR 0012): stable 100k re-import ~1.6 s (2 s
  budget); displaced case (100k inserts + 100k renumbered) ~14.3 s — the
  measured floor of the §11 trigram FTS + §10.2 indexes on sqlite-wasm,
  so its gate is 20 s with documented evidence. Bulk-load path: FTS sync
  triggers dropped inside the commit transaction, messages inserted via
  prepared statements, index backfilled scoped to the import's own rows.

- Import-commit perf gate (§17): committing a 100k-message re-import into a
  chat with 100k stored messages — **~1.6 s** (budget 2.0 s, CI Chromium).
  The plan is computed first; undisplaced rows are never touched, displaced
  rows take the §10.2 offset trick in batched statements, incoming rows
  insert at their final positions.
- planMerge counts `mediaUpgraded` only for twins whose export NEWLY
  provides bytes; two new properties pin this (omitted twins never upgrade;
  upgrades equal the newly-present twin count) — 1,000 runs each.

- Unit (node): **274 passed** — core suites plus the new injection-tested
  modules: `opener.test.ts` (Web Locks lifetime lock: second open →
  LOCK_UNAVAILABLE, release on close / migration failure), `rpc-call.test.ts`
  (timeout carries method + diagnostic id, timer cleared on settle,
  commitImport exemption, sink events), `rpc-validate.test.ts` (every RPC
  input schema: fingerprints, timestamps, coordinates, traversal-safe
  written paths).
- Browser contract tests: **30 passed** on Chromium against real
  sqlite-wasm (boot/import, merge plan with media upgrades, seq-keyset
  search paging, LIKE 500-cap, link extraction, chat management, rollback,
  delete cascade). Storage coverage **≥ 85% lines enforced** on this run.
- Perf: parse 100k **1.2–1.4 s** (budget 2.0 s); fingerprint+merge 100k
  **~1.05 s** (budget 2.0 s); search 100k **< 100 ms** (budget, CI
  Chromium). §19.2.7 regex timing property caught and fixed an unanchored
  attachment pattern (O(n²) → linear).
- Worker coverage strategy (Major 8, ADR 0007 addendum): testable worker
  logic lives in page modules with enforced thresholds —
  `workers/rpc-validate.ts`, `client/rpc-call.ts`, `storage/sqlite/opener.ts`
  each ≥ 85% lines in the unit project; the thin worker shells
  (db.worker, import-api, media-writer) run only in real worker contexts
  and are exercised end-to-end.

## Previously verified (M1)

- Unit (node): **250 passed** — parser, dates, merge, fingerprint,
  text-format, chat-meta, fixtures (58 assertions across 29 variants),
  anonymizer.
- Core coverage: **lines 100% / branches 91.1%** (§19.4 thresholds 95/90);
  structurally-unreachable defensive branches carry v8-ignore with reasons.
- Perf: parse 100k **1.2–1.4 s** (budget 2.0 s) on the CI-style runtime.
- Property suites run 1,000 cases (300 for merge/fingerprint) per run;
  merge property asserts per-input order preservation, cross-list duplicate
  emission from the stored side, and idempotency.

## Known issues

- **WebKit e2e storage flows** — Playwright's bundled Linux WebKit build
  rejects OPFS at the capability gate (upstream
  microsoft/playwright#18235 is **closed as completed**; the fix is in
  Playwright builds newer than the pinned 1.65.1). Boot/axe/CSP flows on
  WebKit assert the unsupported screen; only the offline flow skips. See
  ADR 0007 for the decision and the open M2 question it leaves to the
  owner.
- WebKit e2e cannot launch on the dev machine (missing GTK/GStreamer system
  libraries, no sudo); it runs in CI via `playwright install-deps`.
- Lighthouse 12 removed the PWA category; installability is gated by the
  manifest e2e instead (ADR 0009).
- `pnpm test:browser` and `pnpm bench` pass with no tests until milestones
  M2 / M1 land their suites.

## Deviations from spec

- ADR 0001: TypeScript 5.9 instead of 7.x (typescript-eslint caps at <6.1.0);
  dev-only lint support dependencies added.
- ADR 0006: pure-Node icon generator instead of a rasterizer dependency.
- ADR 0007: WebKit storage flows conditional; boot flows assert the
  unsupported screen (never blanket-skipped).
- ADR 0008: FTS5-trigram capability probe deferred to M2 (spec §12.11 item;
  reviewer-approved approach requested in round 1).
- ADR 0009: PWA installability gate replaced (Lighthouse 12 removed the
  audit).
