# ADR 0003 — SQLite over OPFS SAH-pool

## Context

xyChat needs a real database (100k+ messages, FTS5 substring search) in a
browser, without cross-origin isolation (GitHub Pages cannot set COOP/COEP,
so `SharedArrayBuffer` is unavailable — §2).

## Decision

Use `@sqlite.org/sqlite-wasm` with the **`opfs-sahpool`** VFS:

- one SQLite connection owned exclusively by `db.worker`;
- storage inside OPFS via `FileSystemSyncAccessHandle` (supported on iOS 17+);
- `journal_mode=DELETE` (WAL relies on features this VFS does not support);
- single-instance enforcement via `navigator.locks`.

## Alternatives considered

- `opfs` VFS (multi-tab) — requires COOP/COEP; unavailable on Pages.
- IndexedDB-backed stores (Dexie, custom) — no FTS5, weaker query power at
  100k rows, hand-written indexes.
- localStorage/OPFS flat files — no query engine at all.

## Consequences

- One tab at a time owns the DB (by design; second instance shows a notice).
- FTS5 trigram tokenizer is verified at boot; failure is a hard capability
  error, never a silent degrade.
