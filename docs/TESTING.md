# Manual on-device test checklist

Run on a real iPhone (iOS 17+) before each milestone merge that touches UI,
storage or import. Record results (date, device, OS, pass/fail) per run.

## Install & boot

- [ ] Open the Pages URL in Safari; app loads, no console errors.
- [ ] Add to Home Screen; opens standalone (no Safari chrome).
- [ ] Airplane mode → reload → app still boots.

## Import (from M3)

- [ ] Export a chat from WhatsApp (with media) → import → bubbles, media,
      dates correct.
- [ ] Export without media → placeholders shown.
- [ ] Cancel mid-import → no chat, storage unchanged.
- [ ] Re-import same export → 0 added.
- [ ] Re-import newer export → only new messages added.
- [ ] 1 GB+ archive import completes with screen kept awake; no crash.

## Chat view (from M4)

- [ ] Smooth scroll on a 100k-message chat.
- [ ] Day separators correct around midnight.
- [ ] RTL text (Urdu/Arabic) renders with correct direction.
- [ ] Emoji-only messages render large.
- [ ] Dark mode throughout.
- [ ] Long-press on a bubble's text opens the message actions (no text
      selection loupe); long-press on a chat-list row opens its actions (no
      link preview).

## Search, jump and bookmarks (from M5)

- [ ] Global search on a 100k-message chat returns results quickly; the
      keyboard's Search key does not reload the page.
- [ ] Tapping a result opens the chat at that message, highlighted.
- [ ] In-chat search: counter and up/down arrows walk the matches; the
      on-screen keyboard does not cover the bar.
- [ ] Jump to date: only days with messages are tappable; the week starts
      on the phone's usual first day.
- [ ] Jump-to-latest button appears when scrolled up and returns to the end.
- [ ] Bookmark a message, add a note, find it under Bookmarks, show it in
      the chat, remove it.

## VoiceOver (from M4)

- [ ] Navigate chat list; rows announce title + preview.
- [ ] Open a chat; messages announce "sender, date time, text".
- [ ] Use search with VoiceOver.
- [ ] Operate the lock screen.

## Voice notes (from M6)

- [ ] `.opus` voice note plays (fallback path when needed).
- [ ] Playback pauses when app goes to background.

## Lock (from M7)

- [ ] Set PIN; background the app → privacy cover in app switcher.
- [ ] Failed attempts trigger the growing delay.

## Storage & backup (from M7/M8)

- [ ] Persistent storage granted after first import.
- [ ] Delete chat frees storage.
- [ ] Backup → delete → restore round-trips.

## Import memory notes (M3, §17 manual targets)

- The media phase STREAMS entries from the opened archive chunk-by-chunk
  into OPFS sync-handle sinks — the largest in-memory object is one
  decompressed chunk, never a whole entry. The 1 GB /
  5k-media manual run should show flat memory in Xcode's memory gauge.
- Thumbnail sources are capped at 25 MB (THUMBNAIL_SOURCE_CAP) — larger
  images get no thumbnail (type icon instead) rather than risking a
  decode-time memory spike.
- The commit-phase renumbering touches only displaced rows; on a stable
  re-import the FTS triggers are dropped for the duration of the
  transaction and the index backfills scoped to the import's own rows
  (ADR 0012).
