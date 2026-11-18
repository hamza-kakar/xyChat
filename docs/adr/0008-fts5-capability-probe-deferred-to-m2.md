# ADR 0008 — FTS5-trigram capability probe is deferred to M2

## Context

§12.11 lists the boot capability check including "FTS5 trigram", and §22 M0
requires the capability check to be part of the app shell. Implementing the
probe in M0 means shipping and executing `@sqlite.org/sqlite-wasm` (multi-MB
WASM) during every boot just to answer one boolean — while nothing in M0
reads or writes a database. §17 also requires the sqlite wasm to stay out of
the initial bundle; a boot-time probe would need it lazy-loaded on the main
thread, a loading pattern that M2's db.worker then duplicates.

A round-1 review flagged the omission as a blocker and asked either for the
probe or for a documented, owner-reviewed deferral. This is that ADR.

## Decision

> **Ratified by the owner (2026-11-18):** the M2 deferral stands.

- Defer the FTS5-trigram probe to **M2**, where sqlite-wasm and the single
  database connection are introduced anyway.
- In M2, the probe runs inside db.worker during boot: open an in-memory
  database and `CREATE VIRTUAL TABLE temp.fts_probe USING fts5(x,
tokenize='trigram')`. The app shell waits for the result; failure renders
  the unsupported screen with the `fts5` capability entry.
- The capability id `fts5` is reserved now; the i18n string
  `en.capability.fts5` stays defined (it was already present) so the M2
  wiring is a probe implementation, not a UI change.
- The wasm stays lazy-loaded and out of the size-limit entry-chunk budgets.

## Alternatives considered

- Implementing the probe in M0 on the main thread — pulls the largest
  dependency into the boot path, duplicates M2's loading pattern, and
  measures a database engine the app cannot yet use.

## Consequences

- Until M2, a device without FTS5 trigram support would pass the boot gate
  and fail later, at first import — accepted for M0's storage-less scope and
  revisited as the first M2 acceptance item.
- ADR 0003's claim ("FTS5 trigram tokenizer is verified at boot") becomes
  true with the M2 landing of this probe; until then this ADR documents the
  deferral.
