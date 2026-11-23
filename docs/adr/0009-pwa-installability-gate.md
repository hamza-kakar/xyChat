# ADR 0009 — PWA installability gate replaces the removed Lighthouse audit

## Context

§17 lists "PWA installable" as a CI-enforced Lighthouse budget. Lighthouse
12 removed the PWA category entirely (including the `installable-manifest`
audit), so `lhci` cannot express that assertion any more; the only available
category assertions are performance, accessibility and best-practices.
Replacing the gate with a note in the docs would quietly weaken it; the spec
(§0.5) requires a gate change to come with an ADR and a concrete replacement.

## Decision

Installability is enforced by a dedicated **e2e manifest test**
(`tests/e2e/manifest.spec.ts`) that runs on Chromium and WebKit alike (no
OPFS involved, so it is never skipped):

1. Fetch `/manifest.webmanifest` from the running preview and validate with
   the Valibot schema: `name`, `short_name`, `start_url`, `scope`,
   `display: 'standalone'`, `background_color`, `theme_color`, and 192 px +
   512 px icons including a `maskable` one.
2. Resolve every icon URL against the page origin and assert HTTP 200 with an
   image content type.
3. Assert the document has an `apple-touch-icon` link that resolves.
4. The service-worker half of installability (offline reload works) stays
   covered by the existing offline e2e flow on Chromium.

LHCI keeps the three available category budgets (performance ≥ 0.9,
accessibility = 1, best-practices ≥ 0.95).

## Alternatives considered

- Downgrading Lighthouse to v9/v10 to keep the audit — blocks the toolchain
  in the past and conflicts with the pinned stack.
- Dropping the gate with only a STATUS note — unguarded installability; the
  original review objection.

## Consequences

- Installability regressions (manifest fields, icon paths) fail CI
  deterministically and fast, independent of Lighthouse's audit set.
- The test imports Valibot, already a runtime dependency (§4.2).
