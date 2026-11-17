# ADR 0004 — Content Security Policy via meta tag

## Context

GitHub Pages cannot set response headers, so a CSP must be delivered inside
the document. Meta CSP cannot carry `frame-ancestors` (header-only directive)
and cannot protect against some response-splitting scenarios.

## Decision

Inject `<meta http-equiv="Content-Security-Policy">` at **build time** via a
Vite plugin (never in dev, where HMR scripts would violate it). The policy
from §15.1 is applied verbatim. E2E tests listen for
`securitypolicyviolation` events across every flow and fail on any violation.

## Alternatives considered

- Hosting with real headers (Netlify/Vercel) — out of scope; the spec fixes
  GitHub Pages.
- No CSP — rejected; untrusted chat content demands defense in depth.

## Consequences

- Clickjacking via framing is not CSP-prevented (accepted limitation,
  documented here and in §15.1); the app contains no state-changing requests
  an attacker could trigger in a frame.
- `style-src 'self'` forbids inline `<style>`; the React `style` prop (CSSOM)
  remains available for the virtualizer.
