# ADR 0002 — Hash routing

## Context

The app is static-hosted on GitHub Pages under `/<repo-name>/` with no
custom HTTP headers or rewrite rules (§2). Deep links like `/chat/x` would 404
on reload or on a shared link, because Pages only serves real files.

## Decision

Use `HashRouter` from react-router: routes live in the URL fragment
(`#/chat/:id`), which is never sent to the server, so every deep link works on
any static host and offline.

## Alternatives considered

- `BrowserRouter` with a 404.html copy trick — fragile with base paths,
  breaks for offline service-worker navigations.
- A tiny custom router — rejected; react-router is on the allowlist and gives
  params, nesting and focus patterns for free.

## Consequences

- URLs carry `#`; cosmetic only for an installed PWA.
- `navigateFallback: 'index.html'` covers the initial request; fragments
  survive reloads.
