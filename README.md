# waChatBack

A private, offline viewer for exported WhatsApp chats. Import a chat export,
browse it in a familiar messaging interface, and keep it on your own device —
forever.

**Your chats never leave this device. The app makes no network requests for
your data.** Everything — database, media, search index — is stored in the
browser's private storage on your phone or computer.

## Features

- Import WhatsApp's **Export Chat** archives (`.zip` with media, or plain `.txt`)
- iOS and Android export formats, detected automatically
- Merge newer exports of the same chat without duplicates
- Chat list, media gallery, global search, bookmarks
- Voice-note playback (including `.opus` notes on iOS)
- Optional app lock (PIN)
- Backup and restore: one file with your chats (and media, if you like) to
  keep in Files or iCloud Drive
- Fully offline after first load — airplane mode forever

## Install on iPhone

1. Open the app URL in Safari.
2. Tap the **Share** button.
3. Tap **Add to Home Screen**.
4. Open waChatBack from your Home Screen and import your first chat.

> **Important:** install to the Home Screen _before_ importing. A Home Screen
> web app has its own storage, separate from Safari tabs. Data imported in a
> Safari tab can be deleted by Safari.

## Privacy

- No accounts, no cloud sync, no analytics, no crash reporting.
- The service worker caches only the app's own code for offline use.
- The PIN lock is a privacy screen, not encryption. Your device's OS-level
  encryption protects data at rest.
- Keep your original exports: they are the primary backup. You can always
  import them again.
- A backup file made in Settings is not encrypted: it holds your chats as
  they are. Keep it somewhere private.

## Development

```sh
pnpm install
pnpm dev         # development server
pnpm verify      # everything CI runs
```

Requires Node (see `.nvmrc`) and pnpm. See `AGENTS.md` for the full build
specification and `docs/STATUS.md` for progress.

## License

To be decided before the v1.0.0 release (milestone M9).
