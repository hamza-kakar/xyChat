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
