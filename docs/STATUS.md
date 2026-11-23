# Status

Progress tracker for xyChat. Updated in every PR.

## Current milestone

All milestones are merged; M9 — PWA hardening and release: merged (PR #12).

After M9: zip exports over 200 MB are accepted (the text cap now applies to
the chat text only), and the project is MIT-licensed. The real-iPhone run of
`docs/TESTING.md` is in progress.

M8 — Backup and restore: merged (PR #11).

## What's done (M9)

- Update prompt (§12.12, ADR 0016): when a new service worker waits, an
  "Update available" toast offers Reload and Later. Nothing reloads on
  its own; Reload activates the waiting worker and reloads once it takes
  control. The toast waits while an import (picked file → report), a
  backup or a restore (picked backup → report) runs, also when the user
  leaves the screen mid-job, and sits under the lock screen.
- iOS launch images (§14): the app badge on each theme's surface color
  for the 11 iPhone screens that run iOS 17+, light and dark, generated
  with the icons and linked with exact device media queries.
- Accessibility pass (§16): a new e2e sweep runs axe on every route in
  both themes and checks each at double text size for sideways overflow.
  It found and fixed: document/audio buttons whose label hid their
  visible file name (WCAG 2.5.3), the import picker's unlabelled file
  input (now a labelled control with a focus ring), and the chat-list and
  chat headers, banners and diagnostics rows squeezing or overflowing at
  large text (the actions now wrap below the title).
- E2E: flow 14 now opens an imported chat after an offline reload; flow
  15 (update prompt, and its suppression during an import) runs against
  a local release server that publishes a byte-different `sw.js`; the
  import flows assert no CSP violations like every other flow.
- README final: install guide, importing, updates, privacy, limitations.
  `docs/TESTING.md` gains update, launch-image and large-text checks and
  a run log for on-device results.
- Local gates: 708 unit, 95 browser, 34 Chromium e2e. Bundle 162.9 kB JS
  / 7.0 kB CSS gzip (budgets 170 / 25).

## Previously (M8)

- Settings → Backup and restore (§10.6, §12.9):
  - Make a backup of all chats or one, with or without media. The
    estimated size shows first, with the iPhone warning above 1 GB.
    Progress (copying the chats, adding media n of m, finishing) with
    Cancel; the screen stays awake. The archive is
    `xychat-backup-YYYYMMDD-HHMM.zip`: `manifest.json`, the
    `db.sqlite3` snapshot, then `media/…` and `thumbs/…`, written into
    `backup-tmp/` in OPFS. "Share backup" opens the share sheet when the
    browser can share files; "Save backup" downloads it.
  - Restore: pick a backup; the manifest, the entries (§15.2 gates) and
    the database (integrity check, schema version, every row) are
    checked; the preview lists its chats with the matching local chat.
    Per chat: Merge (default for a match), Replace or Skip; Restore or
    Skip otherwise. Progress with Cancel until the commit, then a report
    per chat (added, already there, media restored and not found) with
    Open chat.
  - The original exports are named as the primary safety net, with a
    link to re-import one.
- Storage: snapshots are built in an in-memory scratch database (no app
  settings, no full-text index) and restores read the backup's database
  the same way; rows go through Valibot before use. A restore commits
  every chosen chat in one transaction through the import commit, so a
  merge follows the §8.10 fingerprint rules and fingerprints survive
  verbatim. Each chat has an `in_progress` import row listing its
  written files: cancel, failure and a crash leave nothing (§9.3).
- Deleting a chat also removes its finished import rows (a restore that
  reuses the chat id would otherwise show the old history).
- The wake-lock effect of the import progress step became a shared
  `useScreenWakeLock` hook, also used by backup and restore.
- E2E (Chromium): flow 13 — import, back up with media, delete, restore,
  then a second backup holds the same fingerprints in the same order
  (read from the downloaded zips with `node:sqlite`); media is back and
  "me" is still set; axe on the backup and restore screens.
- Browser tests: snapshot contents, tampered and foreign databases,
  restore as new / merge / replace / copy beside the original, rollback of
  a failing multi-chat commit, cancel leaving no files, quota and bad
  choices, non-backup files.
- Bundle: 162.1 kB JS / 6.9 kB CSS gzip (budgets 170 / 25).

Screenshots (iPhone viewport, light and dark): `docs/screenshots/m8/`.

## Previously (M7)

- Chat info (§12.3 `#/chat/:chatId/info`, §12.7): editable title, group
  or one-to-one, date range (from the stored wall-clock times), totals by
  message kind, stored media counts and bytes with a gallery link,
  participants with message counts as a CSS bar chart, "This is me",
  import history (time, file, added/already there, parser version,
  warnings), "Update from a newer export" (to the import flow, which
  pre-selects the matching chat) and Delete chat. Reached from the chat
  header's info button and the chat list's row menu.
- Import reports (§9.2 step 11): the commit now stores the report in
  `imports.report_json` (counts and warning codes only), validated on
  read. It was never written before.
- Settings (§12.3 `#/settings`, §12.9), from the chat-list toolbar:
  - Appearance: System / Light / Dark. The choice is the one value in
    localStorage (§15.4) and applies before the first paint.
  - App lock (§15.3): 4–8 digit PIN as PBKDF2-SHA-256 (600,000
    iterations, 16-byte salt) in `meta`, checked in db.worker with a
    constant-time compare; auto-lock Immediately / 1 / 5 / 15 min
    (default Immediately); Lock now; changing or removing the PIN needs
    the current one. The scope statement (privacy screen, not
    encryption; no recovery) is in Settings and on the lock screen.
  - Storage: used/quota estimate, media per chat, persistent-storage
    status with Request, and "Clean up orphaned files" behind a
    confirmation (§9.3 sweeper).
  - Diagnostics: app, parser and schema versions, the browser capability
    report, and the log viewer (this session plus earlier sessions) with
    Copy and Clear.
  - About: privacy statement, the original-exports reminder, source link
    and the bundled dependencies' licenses, generated at build time into
    `licenses.json` (precached).
- Lock screen and privacy cover: locked at launch with a PIN; an opaque
  cover goes up synchronously whenever the app is hidden, then the lock
  follows the auto-lock setting (on hide, or after inactivity). The
  screens stay mounted but inert underneath, so an import keeps running.
  The overlay is its own modal dialog, so it stacks above any open sheet
  or media viewer. Five free attempts, then 30 s doubling (capped at a
  day), persisted across reloads; db.worker checks attempts one at a time.
- Logging (§18.7): the last 200 warn/error entries are written to `meta`
  (debounced) and shown under "Earlier sessions".
- E2E (Chromium): flow 11 (chat info → storage per chat → delete from
  chat info → media files and storage entry gone, nothing orphaned), flow
  12 (set PIN, cover on hide, lock, unlock, five failures → lockout that
  survives a reload), the lock covering an open sheet and staying
  usable, Settings sections with axe in light and dark, the
  theme surviving a reload, chat info and lock screen axe-checked.
- Bundle: 158.3 kB JS / 6.8 kB CSS gzip (budgets 170 / 25).

Screenshots (iPhone viewport, light and dark): `docs/screenshots/m7/`.

## Previously (M6)

- Gallery (§12.3 `#/chat/:chatId/media?tab=`, §12.6): Photos (with
  stickers and GIFs), Videos, Audio (voice notes and audio), Documents
  and Links tabs. Stored media only, newest first, keyset pages of 120,
  grouped under month headers and virtualized; photos and videos in a
  3-column grid (5+ on wide screens), audio and documents as rows. The
  tab is validated (unknown → Photos); the chat header gains a media
  button.
- Full-screen viewer: image (pinch zoom, double-tap zoom, pan when zoomed,
  swipe sideways between items and down to close, all on pointer events;
  no transitions under reduced motion), native video (`playsinline`,
  `preload="metadata"`), the audio player, and documents (icon, name,
  size, Open in a new tab, Share with the file, Save). Previous/next
  buttons and arrow keys (mirrored under RTL), Escape closes, focus is
  trapped and restored (`<dialog>`), and every viewer has "Show in chat".
- Bubbles: voice notes and audio play in place; photos, videos (and MP4
  GIFs) and documents open the viewer on that item; video bubbles show a
  thumbnail.
- Audio player (§13.2): play/pause, seek bar, elapsed/total, 1×/1.5×/2×.
  Loads on first play; one item plays at a time and playback pauses when
  the app is hidden or the viewer closes. The duration measured on first
  play is stored (`setAttachmentDuration`).
- Opus fallback (§13.2): when `canPlayType('audio/ogg; codecs=opus')` is
  empty, a lazily spawned audio worker streams the stored file through
  ogg-opus-decoder and writes 16-bit PCM straight into
  `cache/audio/<id>.wav` (own WAV encoder in `platform/audio.ts`), reused
  afterwards and deleted with its chat. Decodes are serialized.
- Lazy video thumbnails (§13.3): a visible video without a thumbnail is
  seeked to min(1 s, duration/2) in an offscreen `<video>`, drawn at a
  320 px long edge and saved as JPEG through db.worker, which records
  `thumb_path`. At most two at once; a failure keeps the type icon for the
  session.
- Links tab: messages whose body contains a link (paged in SQL), expanded
  in TS with the same linkifier as the bubbles (http/https/mailto/tel
  only); each link shows its domain, the message and "Show in chat".
- Workers are bundled as ES modules, so ogg-opus-decoder's optional ML
  build (4 MB, never used) is a separate chunk kept out of the precache
  (ADR 0013); the audio worker is ~134 kB.
- E2E (Chromium): flow 8 (gallery → viewer → next → double-tap zoom →
  Show in chat, highlighted), documents and links tabs, flow 9 (voice
  note plays natively; and with `canPlayType` forced empty, plays the
  decoded WAV, which is cached in OPFS), with axe on the gallery, the
  viewer and the tabs. The voice note fixture is a real Ogg Opus stream
  generated at test time.

Screenshots (iPhone viewport, light and dark): `docs/screenshots/m6/`.

## Previously (M5)

- Global search (§11, §12.3 `#/search?q=`): the query lives in the URL,
  FTS5 trigram phrase search for 3+ characters, filters for chat, sender
  (once a chat is chosen), message kinds and a date range, newest-first
  keyset pages of 50 behind "Show more". Results name the chat, sender and
  time and show the ±40-character snippet with matches in `<mark>` (split
  in TS, never FTS markup). 1–2 character queries run only with a chat
  filter (LIKE fallback, 500-result cap, with a hint).
- In-chat search (§11): a bar under the chat header with a "12 of 87"
  counter and previous/next (Enter steps to the older match, Escape
  closes). It starts at the newest match; every step scrolls the
  virtualized list to the message, centred, with a brief highlight. Backed
  by a new `listMatchingSeqs` query that returns every matching seq in one
  packed row (cap 10,000, shown as "of 10,000+"). `?q=` opens it
  prefilled; `?seq=N` opens the chat at a message, highlighted.
- Jump to date (§12.5): a custom calendar sheet limited to the chat's
  months, days with messages marked (new `listMessageDays` query, one
  packed row of day numbers), weeks starting on the locale's first day
  (`Intl.Locale` week info, Monday where the engine has none), plus "First
  message" and "Last message". Picking a day uses `findSeqByDate`.
- Jump to latest (§12.5): a floating button with the count of messages
  below the viewport.
- Bookmarks (§12.5): Bookmark / Edit bookmark note / Remove bookmark in
  the message actions; bookmarked bubbles carry an icon and "Bookmarked"
  in their spoken label. Bookmarks screen (`#/bookmarks`) lists every
  bookmark newest first with chat, sender, time, text and note, with Show
  in chat, Add/Edit note and Remove. Adding upserts the note (one bookmark
  per message) and only stores a bookmark whose message is in that chat;
  the list reads bookmarks with their messages in one statement.
- Entry points: Search and Bookmarks in the chat-list toolbar; search and
  jump-to-date buttons in the chat header (disabled for an empty chat).
- New `highlight` colour token for matches and the jumped-to row, AA
  checked against text in both themes.
- Fix carried from earlier milestones: `.safe-area` was an unlayered rule,
  so it silently replaced every Tailwind padding utility on the same
  element (and padded headers with the home-indicator inset). The insets
  are now layered utilities on outer boxes, with spacing on inner boxes;
  the chat list, chat view, search and bookmarks screens take the side and
  home-indicator insets.
- E2E (Chromium): flow 6 (global search → open hit → highlighted in
  view), flow 7 (in-chat previous/next, jump to date, jump to latest,
  first message), flow 10 (bookmark, edit note, bookmarks screen, show in
  chat, remove), with axe in light and dark on the new screens and sheets.
- Perf (CI Chromium, 100k messages, budget 100 ms): search page ~55 ms,
  full in-chat match list (10k of 33k matches) ~40–85 ms, day list
  ~45–55 ms.

Screenshots: `docs/screenshots/m5/`.

## Previously (M4)

- Chat list (§12.4): avatar initials and colour from the title hash, group
  icon, last-message preview with sender prefix in groups and media-type
  labels, relative dates (time today, weekday this week, short date
  otherwise), sorted by last message, instant local title filter, empty
  state with install hint, long-press/context menu with Rename, Delete
  (confirmation shows message/media counts and bytes; media folders are
  deleted after the DB commit, §10.4).
- Chat view (§12.5): `@tanstack/react-virtual` list with dynamic
  measurement, 300-message windows loaded around an anchor seq in both
  directions, opens at the last message, scroll position remembered per
  chat for the session and in `meta` for the last chat; day separators and
  a sticky day pill; incoming/outgoing alignment by self; group sender
  names in the participant palette on the first bubble of a 5-minute run;
  grouped bubbles; time and "edited" label; `dir="auto"` +
  `unicode-bidi: plaintext`; jumbomoji for 1–3 emoji.
- Formatting renderer over the `core/text-format` AST (bold, italic,
  strike, inline code, monospace blocks, quotes, lists) and linkify-it
  links limited to http/https/mailto/tel. No HTML strings anywhere.
- Every message kind: system pill, deleted, call, location card (Apple
  Maps link, no tiles), poll card, contact card (name from the `.vcf` `FN:`
  line read in db.worker with the §15.2 1 MB cap), media bubbles (image and
  sticker thumbnails with `aspect-ratio` from stored size, video tile with
  a type icon, voice/audio as a non-interactive row until M6, documents,
  omitted/missing placeholders). Object URLs come from an LRU cache (200
  entries, revoked on eviction and route change).
- Self banner ("Choose which person is you") with a participant sheet;
  message actions sheet: copy, share (`navigator.share`), message info
  (timestamp, sender, kind, import file).
- Themes: light/dark tokens extended for bubbles and the participant
  palette, all pairs WCAG-AA checked by unit test. Two-pane layout at
  ≥ 768 px.
- Storage: chat-list preview fields, last-chat position in `meta`, contact
  names; migration `0002` adds `idx_attachments_message`, and a message
  window reads its attachments in one statement (100k chat opens in
  ~150 ms on Chromium).
- Fix carried from M3: `.txt` exports (no zip) failed with
  `CORRUPT_ARCHIVE`; they now open as an archive with no media.
- E2E (Chromium): rendering of an imported group with axe light/dark, copy
  and message info, rename and delete with OPFS cleanup, self banner, RTL
  direction (flow 17), and the 100k chat: first bubbles ≤ 300 ms after
  opening, no long task > 50 ms in a scripted fast scroll, place restored
  after leaving.

Screenshots (iPhone viewport, light and dark): `docs/screenshots/m4/`.

## Previously (M3)

- import.worker with every §9.1 phase, confirmation handshake, streamed
  media writes through sync access handles, image thumbnails, merge and
  re-import, cancellation with rollback of exactly the written paths
  (flushed every 100 paths), boot rollback of `in_progress` imports,
  orphan sweeper API, persistent-storage request after the first import.
- Import UI (§12.8): install gate with bypass, picker, confirm screen with
  DMY/MDY live preview, progress with wake lock and cancel, report with
  plain-language warnings and safe diagnostics.
- §22 M3 scale gate: 100k messages + 2k media imported without memory
  errors (browser test); e2e flows 2–5 on Chromium.

## Previously (M2)

- sqlite-wasm + opfs-sahpool in db.worker behind a typed wrapper
  (§10.1 pragmas: journal_mode=DELETE, foreign_keys, synchronous,
  temp_store, cache_size); single-instance navigator.locks probe.
- Migration framework (§10.3) + 0001_init schema (§10.2): STRICT tables,
  FTS5 trigram external-content index with sync triggers, §11 indexes.
- Rows validated at the boundary with Valibot (§18.5), snake→camel
  mapping per table.
- SqliteChatRepository: chat list/participants/windows (with
  attachments), findSeqByDate, search (FTS phrase + LIKE fallback, keyset
  paging, ±40 snippets), attachment + links pages, chat stats, self/
  rename/delete, bookmarks, import history, storage usage.
- Transactional import commit (§9.2 step 10): import row, chat
  upsert/create, deterministic participant ids + §10.2 palette hash,
  occurrence-counted fingerprints, duplicate skip, attachments, +1e9 seq
  renumber trick, in-transaction aggregates.
- db.worker over Comlink with typed DbApi; INTERNAL error serialization
  (§18.7); boot rollback of in_progress imports (§9.3). db-client on the
  main thread (§3.1 layer-clean, no app imports in workers).
- FTS5-trigram probe wired into the boot gate via ready() (ADR 0008
  ratified): db.worker open failure renders the unsupported screen.
- OPFS media-store (§10.4): canonical paths, sync-access-handle writes,
  async reads, recursive chat-media delete, orphan path listing.
- Browser-mode contract tests (§10.5): open/migrate/FTS5, commit+read+
  search+delete round-trip, duplicate-skip re-import merge — green on
  Chromium; WebKit leg runs in CI (dev machine lacks system libs).

## Previously (M1)

- `core/` complete per §6–§8: Result, branded ids, domain model,
  LocalDateTime (UTC-trick formatting, canonical form, tsKey), the four
  header grammars with locale tables (en), detectFormat (evidence-based
  grammar vote, date-order resolution with conflict detection, preview
  sample), line assembly (continuations, orphan/invalid-date/
  out-of-order warnings, progress events), classification (system-before-
  split, attachments, omitted placeholders, locations, polls, calls,
  deleted/edited), attachment media typing + static MIME table,
  fingerprinting (injected SHA-256, pure-TS UTF-8), planMerge (§8.10
  rules 1–3), chat metadata, WhatsApp text-format tokenizer.
- 29 golden fixtures (§19.2) generated with an expectation-guarded
  script; fixture runner pins parser output to committed expected.json.
- Property tests (§19.2): never-throws, line accounting, round-trip,
  fingerprint determinism, merge idempotency/order/losslessness, tokenizer
  leaf preservation, locale-regex timing budget.
- Perf gate: 100k-message parse in ~1.2–1.4 s (budget 2 s) via
  scripts/perf-check.ts in the CI perf job.
- Anonymizer (§19.3): parse-rebuild approach, Person A/B mapping
  (including system-event actors), same-length pseudo-words, marker
  vocabulary and file names preserved; CLI + unit tests.
- docs/EXPORT-FORMATS.md evidence log.

## Previously (M0)

- Repository initialized; spec (`AGENTS.md`) committed at the repo root and
  adopted as the source of truth.
- App named **xyChat** (owner rename; single `APP_NAME` constant in
  `src/app/app-name.ts`, interpolated into i18n strings and injected into
  `index.html` at build time).
- Vite + React + TypeScript (strict) scaffold with the layer layout from §3.1.
- Tailwind CSS v4 design tokens: single-source dark palette primitives,
  applied via `prefers-color-scheme` (plus a `data-theme` hook for the M7
  manual override); WCAG-AA contrast verified by unit test for **both**
  palettes.
- App shell: error boundary, boot capability check (single cached worker
  probe, 5 s timeout, bounded boot), structured local logger (ring buffer,
  no-template-literal lint rule), minimal home screen.
- PWA manifest + service worker (prompt registration), generated original
  icons (`scripts/generate-icons.ts`, pure Node PNG encoder). Installability
  gated by `tests/e2e/manifest.spec.ts` (ADR 0009).
- Tooling: ESLint (strictTypeChecked, zero warnings), Prettier,
  dependency-cruiser layer rules, size-limit (**gzip** budgets per §17),
  LHCI, lefthook (Prettier incl. ts/tsx), Vitest (node / happy-dom /
  browser configs), Playwright (iPhone 13 WebKit + Pixel 7 Chromium).
- CI (9 jobs, SHA-pinned actions), GitHub Pages deploy (gated on CI success),
  release-please (node type + config/manifest files), Renovate, PR template.
- ADRs 0001–0009.

## Verified results (round-1 feedback rework)

- Unit + component: **42 passed** (node TZ matrix runs in CI).
- Coverage: `app/**` ≥ 70% lines (threshold enforced via `pnpm
test:coverage` in the unit job); overall 60% lines — `platform/capabilities.ts`
  real probes need a browser environment and are exercised by e2e; the
  probe/override seams are unit-tested with substituted probes.
- E2E (Chromium, Pixel 7 profile, production build): **8 passed, 0 skipped,
  0 flaky across 3 consecutive runs** — boot, axe light + dark (dark palette
  actually applied: `--surface` asserted `#101413`), offline reload,
  manifest installability, CSP violations zero in every flow. WebKit runs
  the same flows, asserting the unsupported screen where the capability gate
  refuses (ADR 0007); the offline flow is the only OPFS-conditional skip.
- Bundle (gzip, §17 budgets 170/25): JS **83.92 kB**, CSS **3.34 kB**.
- `pnpm audit --prod --audit-level=high`: no known vulnerabilities.
- LHCI: performance / a11y / best-practices budgets enforced in CI.

## What's next

- The owner runs the `docs/TESTING.md` checklist on a real iPhone
  (voice notes, lock, large imports, VoiceOver, launch images, updates)
  and records it in the run log.
- v1.0.0: the release-please PR tags it when the owner merges it.
- A license for the repository (the README says none is chosen yet).

## Verified results (M2 + audit rounds 2–3)

- Import-commit perf (ADR 0012): stable 100k re-import ~1.6 s (2 s
  budget); displaced case (100k inserts + 100k renumbered) ~14.3 s — the
  measured floor of the §11 trigram FTS + §10.2 indexes on sqlite-wasm,
  so its gate is 20 s with documented evidence. Bulk-load path: FTS sync
  triggers dropped inside the commit transaction, messages inserted via
  prepared statements, index backfilled scoped to the import's own rows.

- Import-commit perf gate (§17): committing a 100k-message re-import into a
  chat with 100k stored messages — **~1.6 s** (budget 2.0 s, CI Chromium).
  The plan is computed first; undisplaced rows are never touched, displaced
  rows take the §10.2 offset trick in batched statements, incoming rows
  insert at their final positions.
- planMerge counts `mediaUpgraded` only for twins whose export NEWLY
  provides bytes; two new properties pin this (omitted twins never upgrade;
  upgrades equal the newly-present twin count) — 1,000 runs each.

- Unit (node): **274 passed** — core suites plus the new injection-tested
  modules: `opener.test.ts` (Web Locks lifetime lock: second open →
  LOCK_UNAVAILABLE, release on close / migration failure), `rpc-call.test.ts`
  (timeout carries method + diagnostic id, timer cleared on settle,
  commitImport exemption, sink events), `rpc-validate.test.ts` (every RPC
  input schema: fingerprints, timestamps, coordinates, traversal-safe
  written paths).
- Browser contract tests: **30 passed** on Chromium against real
  sqlite-wasm (boot/import, merge plan with media upgrades, seq-keyset
  search paging, LIKE 500-cap, link extraction, chat management, rollback,
  delete cascade). Storage coverage **≥ 85% lines enforced** on this run.
- Perf: parse 100k **1.2–1.4 s** (budget 2.0 s); fingerprint+merge 100k
  **~1.05 s** (budget 2.0 s); search 100k **< 100 ms** (budget, CI
  Chromium). §19.2.7 regex timing property caught and fixed an unanchored
  attachment pattern (O(n²) → linear).
- Worker coverage strategy (Major 8, ADR 0007 addendum): testable worker
  logic lives in page modules with enforced thresholds —
  `workers/rpc-validate.ts`, `client/rpc-call.ts`, `storage/sqlite/opener.ts`
  each ≥ 85% lines in the unit project; the thin worker shells
  (db.worker, import-api, media-writer) run only in real worker contexts
  and are exercised end-to-end.

## Previously verified (M1)

- Unit (node): **250 passed** — parser, dates, merge, fingerprint,
  text-format, chat-meta, fixtures (58 assertions across 29 variants),
  anonymizer.
- Core coverage: **lines 100% / branches 91.1%** (§19.4 thresholds 95/90);
  structurally-unreachable defensive branches carry v8-ignore with reasons.
- Perf: parse 100k **1.2–1.4 s** (budget 2.0 s) on the CI-style runtime.
- Property suites run 1,000 cases (300 for merge/fingerprint) per run;
  merge property asserts per-input order preservation, cross-list duplicate
  emission from the stored side, and idempotency.

## Known issues

- **WebKit e2e storage flows** — Playwright's bundled Linux WebKit build
  rejects OPFS at the capability gate (upstream
  microsoft/playwright#18235 is **closed as completed**; the fix is in
  Playwright builds newer than the pinned 1.65.1). Boot/axe/CSP flows on
  WebKit assert the unsupported screen; only the offline flow skips. See
  ADR 0007 for the decision and the open M2 question it leaves to the
  owner.
- WebKit e2e cannot launch on the dev machine (missing GTK/GStreamer system
  libraries, no sudo); it runs in CI via `playwright install-deps`.
- Lighthouse 12 removed the PWA category; installability is gated by the
  manifest e2e instead (ADR 0009).
- A voice note playing in a bubble stops when its row scrolls far out of
  the virtualized list (the row unmounts). The gallery's Audio tab keeps
  playing in the full-screen player.
- Bare domains (`example.com` without a scheme) are not linked: linkify-it
  runs with its defaults and only explicit http/https/mailto/tel links
  render as anchors.

## Deviations from spec

- ADR 0001: TypeScript 5.9 instead of 7.x (typescript-eslint caps at <6.1.0);
  dev-only lint support dependencies added.
- ADR 0006: pure-Node icon generator instead of a rasterizer dependency.
- ADR 0007: WebKit storage flows conditional; boot flows assert the
  unsupported screen (never blanket-skipped).
- ADR 0008: FTS5-trigram capability probe deferred to M2 (spec §12.11 item;
  reviewer-approved approach requested in round 1).
- ADR 0009: PWA installability gate replaced (Lighthouse 12 removed the
  audit).
- M5: the repository gains `listMatchingSeqs` (in-chat navigation needs
  every matching seq, not a page of snippets) and `listMessageDays`
  (calendar marks) beyond the §10.5 interface; `addBookmark` returns
  null when the message is not in the given chat.
- M5: the sender/kind/date filters live on the search screen, where a
  chat filter turns it into a filtered in-chat search with snippets; the
  in-chat bar is query-only, like the counter-and-arrows design in §11.
- M4: each bubble has a "Message actions" button for keyboard and switch
  users; it is visually hidden until focused, since touch users long-press
  and mouse users right-click.
- M4: one described `eslint-disable-next-line react-hooks/incompatible-library`
  on `useVirtualizer` (TanStack Virtual returns a mutable instance by
  design).
- M4: migration `0002` (index on `attachments.message_id`) added for the
  §17 open-chat budget.
- M6: the repository gains `setAttachmentDuration` and
  `saveVideoThumbnail` (§13.2, §13.3 write paths); gallery and link pages
  carry the message's seq, time and sender for the viewer and "Show in
  chat".
- M6: the chat header gets a media button (the spec's header lists
  search, jump and info; the gallery needs an entry point before chat info
  lands in M7).
- M6: voice notes and audio play inside their bubbles and gallery rows
  open the full-screen player; stickers are not tappable.
- M6: two described `jsx-a11y/media-has-caption` disables on `<audio>` and
  `<video>` (exported chats carry no caption tracks), and the same
  described `react-hooks/incompatible-library` disable as M4 on the
  gallery's `useVirtualizer`.
- ADR 0013: workers bundle as ES modules; the unused Opus ML chunk is not
  precached.
- ADR 0014 (M7): the lock is an overlay over inert screens; the privacy
  cover goes up on every hide, PIN or not; auto-lock defaults to
  Immediately; the backoff caps at one day; changing or removing the PIN
  needs the current PIN; chat-info media counts cover stored files; the
  license list is generated at build time and precached.
- M7: the toolbar's Import is now an icon button (same accessible name) so four actions fit beside the
  title on a phone.
- M7: the repository gains settings methods beyond §10.5
  (`getLockState`, `verifyPin`, `changePin`, `setAutoLock`,
  `getSchemaVersion`, `listPersistedLogs`, `savePersistedLogs`).
- ADR 0015 (M8): backup snapshots and restore sources are in-memory
  scratch databases instead of sahpool `exportFile` / `VACUUM INTO`;
  backups leave out app settings and the full-text index; backup and
  restore run in db.worker; a restored chat's import history starts with
  the restore; the archive name uses the app name (`xychat-backup-…`).
- M8: the db.worker API gains `estimateBackup`, `createBackup`,
  `clearBackupFiles`, `inspectBackup` and `restoreBackup` (beyond §10.5).
- ADR 0016 (M9): the update prompt also waits during backups and during
  the import's detect and confirm steps, and has a Later button; launch
  images cover iPhones only.
