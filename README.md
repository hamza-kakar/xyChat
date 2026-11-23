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

Requires iOS or iPadOS 17 or later.

1. Open <https://hamza-kakar.github.io/wachatback/> in Safari.
2. Tap the **Share** button.
3. Tap **Add to Home Screen**, then **Add**.
4. Open waChatBack from your Home Screen.

> **Important:** install to the Home Screen _before_ importing. A Home Screen
> web app has its own storage, separate from Safari tabs. Data imported in a
> Safari tab can be deleted by Safari.

On a computer or Android phone, open the same address in a current browser
and use its **Install** option (or just use it in a tab).

## Import a chat

1. In WhatsApp, open the chat, then **Export Chat** (in the chat's info
   screen on iPhone, or the ⋮ menu → More on Android).
2. Choose **Attach Media** to keep photos, videos and voice notes, or
   **Without Media** for text only.
3. Save the export to **Files** (iPhone) or your device storage.
4. In waChatBack, tap **+**, choose the export file, check the detected date
   format and who you are, and start the import. Keep the app open until it
   finishes.

Exporting the same chat again later and importing it adds only the new
messages.

## Updates

The app updates itself in the background. When a new version is ready, a
**Update available** message offers **Reload**; nothing reloads on its own,
and the message waits until an import, backup or restore has finished.

## Privacy

- No accounts, no cloud sync, no analytics, no crash reporting.
- The service worker caches only the app's own code for offline use.
- The PIN lock is a privacy screen, not encryption. Your device's OS-level
  encryption protects data at rest.
- Keep your original exports: they are the primary backup. You can always
  import them again.
- A backup file made in Settings is not encrypted: it holds your chats as
  they are. Keep it somewhere private.

## Limitations

- WhatsApp exports contain no reactions, replies-in-context or read
  receipts, so waChatBack can't show them.
- Exports have no time zone: times are shown exactly as written in the
  export.
- Date formats are detected from the file. When the order of day and month
  can't be told apart, the import asks you to choose.
- Export phrases (system messages, "image omitted" and so on) are
  recognised in English; chats exported from a phone set to another
  language import, but some events may show as plain text.
- iOS can clear a web app's storage, for example when the device runs low
  on space. waChatBack asks for persistent storage, but keep your original
  exports or a backup.
- The browser tab and the Home Screen app have separate storage on iPhone.
- Very large backups (over 1 GB) may fail on iPhone memory limits; back up
  chat by chat instead.

## Development

```sh
pnpm install
pnpm dev         # development server
pnpm verify      # everything CI runs
```

Requires Node (see `.nvmrc`) and pnpm. See `AGENTS.md` for the full build
specification and `docs/STATUS.md` for progress.

## License

MIT — see [LICENSE](LICENSE). The licenses of the bundled third-party
packages are listed in Settings → About. One of them, `codec-parser` (used by
the Opus voice-note fallback), is LGPL-3.0 and ships unmodified.
