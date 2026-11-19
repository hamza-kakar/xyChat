# Status

Progress tracker for waChatBack. Updated in every PR.

## Current milestone

**M2 — Storage and db.worker** (complete; PR opened)

## What's done (M2)

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

- M3 — import pipeline (§9, §12.8): zip/txt reading with the archive
  safety checks, confirmation handshake with DMY/MDY live preview,
  thumbnails, cancellation + crash rollback wiring, import UI.

## Verified results (M2 + audit round-2 rework)

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
