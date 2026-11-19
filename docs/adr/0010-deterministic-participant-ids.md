# ADR 0010 — Deterministic participant ids

## Context

§6.2 says all IDs come from `crypto.randomUUID()` via typed constructors in
`core/ids.ts`. The import commit (§9.2 step 10) needs participant ids that
are stable across re-imports of the same chat: upserting by
`UNIQUE(chat_id, display_name)` (§10.2) requires knowing the id BEFORE the
insert, and a fresh UUID per re-import would insert duplicate participant
rows for the same person.

## Decision

Participant ids are deterministic UUID-shaped values computed as an FNV-style
hash of `(chatId, displayName)`, produced inside
`storage/sqlite/participant-upsert.ts`. The §10.2 `UNIQUE(chat_id,
display_name)` constraint makes collisions harmless (the upsert updates the
existing row), and the UUID shape satisfies the TEXT PRIMARY KEY format.

All OTHER ids (chats, messages via rowid, attachments, bookmarks, imports)
continue to use `crypto.randomUUID()` via the `core/ids.ts` constructors, per
§6.2.

## Alternatives considered

- Look up the participant id by `SELECT` before each message insert —
  correct but doubles the query count for author-heavy chats (M1 measured
  100k-message imports at seconds; doubling the statement count is visible).
- Insert participants with fresh UUIDs and resolve duplicates afterwards —
  requires an UPDATE pass and transient UNIQUE violations within the
  transaction.

## Consequences

- The `asParticipantId` cast lives in `participant-upsert.ts` (the storage
  boundary that minted the value), not `rows.ts` — rows read these ids as
  plain strings via the Valibot schema.
- Documented as a §6.2 deviation per §0.6 (this ADR).
