# Status

Progress tracker for waChatBack. Updated in every PR.

## Current milestone

**M1 — Core: parser, dates, fingerprint, merge, text-format** (complete; PR opened)

## What's done (M1)

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

- M2 — storage and db.worker (§10): sqlite-wasm + opfs-sahpool, migrations,
  repository, Comlink API, browser-mode contract tests; the FTS5 boot probe
  (ADR 0008) and the WebKit browser-coverage decision (ADR 0007) land here.

## Verified results (M1)

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
