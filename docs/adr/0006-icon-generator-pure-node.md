# ADR 0006 — Pure-Node icon generation

## Context

M0 needs PWA icons and an apple-touch-icon (§14). The allowlist (§4.2) has no
rasterizer, and adding one (sharp, canvas, @vite-pwa/assets-generator) would
require an ADR and native binaries in CI.

## Decision

Generate the icons from an original vector design defined in code
(`scripts/generate-icons.ts`) and rasterize with a hand-rolled PNG encoder
(zlib + chunk writer, 3×3 supersampling). The design is a rounded badge with
a chat bubble and three dots — original artwork, no brand assets.

## Alternatives considered

- Committing pre-rendered PNGs — rejected: unverifiable provenance and harder
  to evolve consistently.
- Adding `sharp` as a devDependency — rejected: native dependency for a task
  Node's stdlib can do.

## Consequences

- `pnpm icons` regenerates deterministic icons anywhere Node runs.
- Artwork changes are code changes, reviewable in diffs.
