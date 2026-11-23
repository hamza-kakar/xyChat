# ADR 0001 — Stack and pinned versions

## Context

the spec (`docs/SPEC.md`) §4 fixes the technology choices and requires exact version pins,
recorded in an ADR. Versions were resolved from the npm registry at project
start (2026-11-17). Two practical constraints surfaced while resolving:

1. `typescript@7.x` is the latest stable TypeScript, but `typescript-eslint`
   (8.73.0) declares a peer range of `>=4.8.4 <6.1.0`. Linting is a
   CI-blocking quality gate (§18.2), so TypeScript must stay inside that range.
2. `eslint-plugin-import-x` needs import resolvers not named in the §4.2
   allowlist (`eslint-import-resolver-typescript`, plus `globals` for ESLint
   environment definitions, and `@eslint/js` for the recommended base config).

## Decision

- Pin **typescript 5.9.3** (latest 5.x, inside typescript-eslint's supported
  range). Revisit when typescript-eslint supports 7.x (Renovate will propose
  it as a major).
- Add `@eslint/js`, `globals`, and `eslint-import-resolver-typescript` /
  `eslint-import-resolver-node` as dev-only tooling dependencies required by
  the pinned lint plugins. They are not runtime dependencies and add nothing
  to the bundle.
- All runtime dependencies are pinned exactly as listed in `package.json`;
  Renovate updates them weekly through PRs.

## Alternatives considered

- Using TypeScript 7 and dropping type-aware linting — rejected: weakens the
  quality gates, forbidden by §0.5.
- Writing our own resolver/globals — rejected: added complexity for zero value.

## Consequences

- Type-aware lint rules work unchanged.
- The TypeScript major is one step behind latest until typescript-eslint
  catches up; acceptable because the target (`ES2022`) is unchanged.
