# ADR 0014 — App lock behaviour, settings storage and the license list

## Context

M7 adds the app lock (§15.3), Settings (§12.9) and chat info (§12.7). The
spec leaves some details open: what the screens do while locked, which
auto-lock delay is the default, how far the failure backoff grows, who
may change the PIN, where the license list comes from, and what "media
counts" in chat info cover. Building the import history also showed that
the import report (§9.2 step 11) was never written to
`imports.report_json`.

## Decision

- **Lock overlay, not unmount.** While locked (or covered), the routes stay
  mounted under the lock screen with `inert` and `aria-hidden`, so an
  import or restore keeps running and its progress is there after
  unlocking. Nothing renders until the lock state is read, so a locked app
  never shows a chat at launch.
- **Privacy cover on every hide.** The cover goes up whenever the app is
  hidden, PIN or not (the most private reading of §15.3); it is committed
  synchronously (`flushSync`) so the app-switcher snapshot is taken with it.
- **Default auto-lock: Immediately.** The most private of the four choices.
- **PIN checks in db.worker.** The PBKDF2-SHA-256 hash (600,000 iterations,
  16-byte salt) and the failure counter live in `meta`; the worker derives
  and compares (constant time) and answers only pass/fail plus a lockout
  deadline. The hash never reaches the main thread.
- **Backoff.** Five free attempts, then 30 s doubling per failure, capped at
  one day so the deadline can't overflow; attempts during a lockout are
  refused without being checked. A correct PIN resets the counter.
- **Changing or removing the PIN needs the current PIN,** and a wrong one
  counts towards the lockout.
- **License list.** `scripts/generate-licenses.ts` walks the runtime
  dependency tree at build time and writes `public/licenses.json` (not
  committed). Settings → About fetches it from the app's own origin and
  validates it; `licenses.json` is added to the precache patterns so it
  works offline.
- **Chat info media counts cover stored files** (`status = 'present'`),
  matching the chat's `media_count` and bytes; omitted and missing
  references show up as media messages in the totals by kind.
- **Import reports.** The import worker sends its run facts with the
  commit, and the commit stores them with its own counts in
  `imports.report_json` inside the same transaction. Reports are counts
  and warning codes only (§15.4) and are validated on read.
- Backup and restore stay out of Settings until M8.

## Alternatives considered

- **Unmount the app while locked:** simpler, but a lock during an import
  would drop its progress screen.
- **Cover only with a PIN set:** leaves chats in the app-switcher snapshot
  for users without a lock.
- **Verify on the main thread:** would need the hash on the main thread
  and makes the failure counter racy across calls.
- **Commit the license list, or import it as a virtual module:** a
  committed file goes stale; a virtual module needs plugin wiring in every
  test config.
- **Lazy-load Settings and chat info:** tried; Rollup moved the shared code
  into a chunk the entry imports statically, so the initial download didn't
  shrink and the size check would have stopped counting part of it.

## Consequences

- The unlocked screens keep their state across a lock; anything that must
  stop while locked has to watch visibility itself (audio already pauses
  when hidden).
- Users who forget their PIN must clear the app's data (stated in Settings
  and on the lock screen).
- The license list is part of the build output; `pnpm dev` without a
  build shows "could not be loaded" until `pnpm licenses:gen` runs.
