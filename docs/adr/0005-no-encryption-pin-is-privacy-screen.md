# ADR 0005 — The PIN is a privacy screen, not encryption

## Context

An app lock is in scope (§15.3), but the app is a static PWA with all data in
origin-private browser storage. True at-rest encryption of the SQLite DB is
possible only by obfuscating the key next to the data (no secure enclave
available to web pages), which provides no real security and invites false
claims.

## Decision

- The PIN is stored as a PBKDF2-SHA-256 hash (600k iterations, random salt)
  and verified in constant time.
- The lock screen hides content from casual observers and from the iOS app
  switcher snapshot (privacy cover on `visibilitychange`).
- The Settings UI, README and App Store-style copy state plainly: _privacy
  screen, not encryption_; device encryption protects data at rest.

## Alternatives considered

- Encrypting OPFS blobs with a PIN-derived key — rejected: the key must be
  re-typed per session and stored in memory; web storage offers no protection
  against a compromised device, and the honest claim ("encrypted") would be
  misleading marketing.
- Skipping the lock entirely — rejected; users reasonably expect a casual
  privacy barrier.

## Consequences

- Honest security posture, clearly communicated.
- No forgotten-PIN recovery by design; users rely on original exports.
