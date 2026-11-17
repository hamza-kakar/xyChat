# Status

Progress tracker for waChatBack. Updated in every PR.

## Current milestone

**M0 — Scaffold, tooling, CI, deploy** (complete; awaiting review)

## What's done

- Repository initialized; spec (`AGENTS.md`) adopted as the source of truth.
- App named **waChatBack** (owner rename; single `APP_NAME` constant in
  `src/app/app-name.ts`, shared with the Vite manifest config).
- Vite + React + TypeScript (strict) scaffold with the layer layout from §3.1.
- Tailwind CSS v4 with design tokens (`src/app/styles/tokens.css`), light and
  dark themes, WCAG-AA contrast verified by unit test.
- App shell: error boundary, boot capability check, minimal home screen,
  structured local logger (ring buffer).
- PWA manifest + service worker (prompt registration), generated original
  icons (`scripts/generate-icons.ts`, pure Node PNG encoder).
- Tooling: ESLint (strictTypeChecked + project rules, zero warnings), Prettier,
  dependency-cruiser layer rules, size-limit, LHCI, lefthook, Vitest (node /
  happy-dom / browser configs), Playwright config (iPhone 13 WebKit, Pixel 7
  Chromium).
- Tests: 31 unit/component tests green; coverage threshold (app ≥ 70% lines)
  enforced; e2e boots + offline + axe (light/dark) green on Chromium.
- CI (6 jobs, SHA-pinned actions), GitHub Pages deploy, release-please,
  Renovate, PR template.
- ADRs 0001–0006.

## What's next

- M1 — core: parser, dates, fingerprinting, merge, text formatting, fixtures,
  property tests.

## Known issues

- WebKit e2e cannot run on this dev machine (missing GTK/GStreamer system
  libraries; no passwordless sudo). It runs in CI via
  `playwright install-deps`. Local e2e verified on Chromium.
- Lighthouse 12 removed the PWA category, so `installable-manifest` is no
  longer an available audit. Manifest installability is instead verified by
  the offline e2e flow and manifest fields; LHCI asserts performance/a11y/
  best-practices.
- `pnpm test:browser` and `pnpm bench` intentionally pass with no tests until
  milestones M2 / M1 land their suites.

## Deviations from spec

- ADR 0001: TypeScript 5.9 instead of 7.x (typescript-eslint caps at <6.1.0);
  dev-only lint support dependencies added.
- ADR 0006: pure-Node icon generator instead of a rasterizer dependency.
- LHCI PWA assertion replaced with available audits (see known issues) —
  recorded here until an ADR is warranted.
