# ADR 0007 — WebKit e2e skips when the engine lacks OPFS

## Context

The spec (§19.1, §20.3) requires the E2E and browser-mode suites to run on
WebKit and Chromium. On GitHub's Linux runners, Playwright's bundled WebKit
build cannot open the Origin Private File System at all:
`navigator.storage.getDirectory()` rejects with
`UnknownError: The operation failed for an unknown transient reason`.
This is an upstream platform limitation, tracked at
[microsoft/playwright#18235](https://github.com/microsoft/playwright/issues/18235)
(2022, still open at the time of writing). It is not a bug in the app: the
capability gate (§12.11) is _designed_ to refuse boot on engines without
OPFS, and on these runners WebKit correctly shows the "unsupported" screen.

Crucially, real iOS Safari (the primary product target, iOS 17+) has full
OPFS support; only the Linux WebKit test build lacks it.

Attempts to make Linux WebKit pass — probe retries with backoff, single
worker, enlarged `/dev/shm` — were all ineffective, confirming a hard
platform gap rather than a transient failure.

## Decision

- E2E flows that require storage call `skipWithoutOpfs(page)`, which probes
  the engine once and skips with a pointer to this ADR when OPFS is absent.
  Chromium executes the full suite in CI; WebKit runs the suite and reports
  skips.
- The automated OPFS-dependent coverage lives on Chromium; WebKit-class
  (real iOS Safari) verification is performed on real devices per
  `docs/TESTING.md`, as the spec's manual layer already prescribes.
- The same approach will apply to Vitest browser-mode storage tests
  (milestone M2): storage/worker suites run on Chromium; WebKit instances
  skip OPFS-dependent tests with the same guard.

## Alternatives considered

- Waiting for the upstream fix — blocks all milestones indefinitely on
  something outside our control.
- Polyfilling/faking OPFS in WebKit runs — weakens the gate and produces
  misleading green (§0.5 forbids weakening quality gates).
- Dropping WebKit from CI entirely — hides the axe/CSP/boot regressions that
  WebKit can still catch; keeping it with skips preserves that coverage.

## Consequences

- CI reports WebKit e2e as "skipped (4)" rather than red, with an explicit
  reason string.
- The dev-facing limitation is stated in `docs/STATUS.md`.
- When microsoft/playwright#18235 lands in a Playwright release, the skip
  guard self-deactivates (the probe passes and tests run) — no code change
  needed beyond removing it for tidiness.

## Addendum (M2 audit round 2 — browser-mode test placement)

### Context

The review asked for repository contract coverage against the real
sqlite-wasm stack (blocker 4) and a workers-coverage strategy (major 8).
Vitest browser mode on WebKit cannot run them: besides the e2e OPFS gap
above, the WebKit browser-mode context cannot spawn the sahpool VFS either,
and v8 coverage instrumentation does not see code running inside workers.

### Decision

- Repository contract tests live in `tests/browser-chromium/` and run on
  Chromium only, against real sqlite-wasm (in-memory) with the real
  migrations, repository, import-commit and search SQL. `coverage` for
  `src/storage/**` (lines ≥ 85, §19.4) is enforced by this project.
- Worker-side testable logic is moved into page modules with node-project
  thresholds: `workers/rpc-validate.ts` (every RPC input, Valibot §18.5) and
  `client/rpc-call.ts` (timeout regime §18.8) each carry a lines ≥ 85 gate.
  `storage/sqlite/opener.ts` (Web Locks lifetime lock, Major 5) is covered
  the same way via `opener.test.ts` with a fake lock manager.
- The thin worker shells (`db.worker.ts`, `import-api.ts`, `media-writer.ts`)
  run only inside dedicated-worker contexts and are therefore outside v8
  instrumentation; they are exercised end-to-end by every e2e flow and will
  be manually verified per `docs/TESTING.md`. No page-module logic is
  allowed to hide there — reviewers should reject worker-shell growth.

### Consequences

- The browser-coverage report measures exactly what the page can execute;
  worker shells appear neither as lying 0% rows nor as false confidence.
- When workers become instrumentable (or CI gains a worker-aware coverage
  path), the shells can join the thresholds without moving code.
