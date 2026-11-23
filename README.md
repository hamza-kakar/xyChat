<h1 align="center">xyChat</h1>

<p align="center">
  <strong>Your WhatsApp chat exports, readable forever: private, offline, on your own device.</strong>
</p>

<p align="center">
  <a href="https://github.com/hamza-kakar/xyChat/actions/workflows/ci.yml"><img src="https://github.com/hamza-kakar/xyChat/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT license"></a>
  <img src="https://img.shields.io/badge/iOS-17%2B-black.svg" alt="iOS 17+">
  <img src="https://img.shields.io/badge/works-offline-success.svg" alt="Works offline">
</p>

<p align="center">
  <a href="https://hamza-kakar.github.io/xyChat/"><strong>Open the app</strong></a> ·
  <a href="#install-on-iphone">Install</a> ·
  <a href="#import-a-chat">Import a chat</a> ·
  <a href="#privacy">Privacy</a>
</p>

xyChat is a viewer for chats exported with WhatsApp's **Export Chat**. Import
an export once and browse it in a familiar messaging layout: bubbles, photos,
voice notes, search and more, even years later and in airplane mode.

It is a Progressive Web App built for the iPhone Home Screen, and it also runs
in any current desktop or Android browser. There is no server and no account:
the database, media and search index all live in your browser's private
storage. **Your chats never leave your device.**

<table>
  <tr>
    <td align="center" width="20%">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/readme/chats-dark.png">
        <img src="docs/screenshots/readme/chats-light.png" alt="Chat list" width="180">
      </picture>
      <br><sub>Chat list</sub>
    </td>
    <td align="center" width="20%">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/readme/chat-dark.png">
        <img src="docs/screenshots/readme/chat-light.png" alt="Chat view" width="180">
      </picture>
      <br><sub>Chat view</sub>
    </td>
    <td align="center" width="20%">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/readme/search-dark.png">
        <img src="docs/screenshots/readme/search-light.png" alt="Search" width="180">
      </picture>
      <br><sub>Search</sub>
    </td>
    <td align="center" width="20%">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/readme/gallery-dark.png">
        <img src="docs/screenshots/readme/gallery-light.png" alt="Media gallery" width="180">
      </picture>
      <br><sub>Media gallery</sub>
    </td>
    <td align="center" width="20%">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/readme/info-dark.png">
        <img src="docs/screenshots/readme/info-light.png" alt="Chat info" width="180">
      </picture>
      <br><sub>Chat info</sub>
    </td>
  </tr>
</table>

<p align="center"><sub>Screenshots use a made-up demo chat. They follow your GitHub theme (light or dark).</sub></p>

## Highlights

- **Faithful reading.** Bubbles, day separators, sender colors in groups,
  WhatsApp text formatting (_bold_, _italic_, ~strike~, `code`, quotes,
  lists), links, edited and deleted messages, polls, locations, contacts and
  calls.
- **All your media.** Photos with pinch-zoom, videos, documents, and voice
  notes with speed control, including `.opus` notes on iPhone.
- **Built for big chats.** Smooth scrolling through 100,000+ messages, fast
  full-text search in any script, jump to any date, bookmarks with notes.
- **Imports that just work.** iOS and Android exports, `.zip` with media or
  plain `.txt`, with automatic date and time format detection. Re-import a
  newer export and only the new messages are added.
- **Private by design.** No network requests for your data, no accounts, no
  analytics. An optional PIN hides the app, and its content stays out of the
  app switcher.
- **Yours to keep.** Backup and restore of your whole library (or one chat),
  with or without media, as a single file for Files or iCloud Drive.
- **Accessible.** Light and dark themes, Dynamic Type, VoiceOver labels,
  right-to-left languages such as Urdu and Arabic.

## Install on iPhone

Requires iOS or iPadOS 17 or later.

1. Open <https://hamza-kakar.github.io/xyChat/> in **Safari**.
2. Tap **Share**, then **Add to Home Screen**, then **Add**.
3. Open xyChat from your Home Screen.

> [!IMPORTANT]
> Install to the Home Screen **before** importing. On iPhone, a Home Screen
> app has its own storage, separate from Safari tabs, and Safari can delete
> data stored in a tab.

On a computer or an Android phone, open the same address in a current browser
and use its **Install** option, or simply keep using it in a tab.

## Import a chat

1. In WhatsApp, open the chat and choose **Export Chat** (from the chat's info
   screen on iPhone, or ⋮ → More on Android).
2. Pick **Attach Media** to keep photos, videos and voice notes, or **Without
   Media** for text only.
3. Save the export to **Files** (iPhone) or your device storage.
4. In xyChat, tap **+**, choose the export, confirm the detected date
   format and which person is you, and start the import. Keep the app open
   until it finishes.

Exported the same chat again later? Import it the same way: only the new
messages are added, with no duplicates.

## Privacy

- **No network access for your data.** A strict Content Security Policy
  allows the app to load only its own files, and the service worker caches
  only the app's code for offline use.
- **No accounts, no cloud sync, no analytics, no crash reporting, no ads.**
- **The PIN is a privacy screen, not encryption.** Your phone's built-in
  storage encryption protects data at rest.
- **Backups are not encrypted.** A backup file holds your chats as they are,
  so keep it somewhere private.
- **Keep your original exports.** They are your primary backup and can always
  be imported again.

## Updates

The app updates itself in the background. When a new version is ready, an
**Update available** message offers **Reload**. Nothing reloads on its own,
and the message waits until any import, backup or restore has finished.

## Limitations

- WhatsApp exports don't include reactions, quoted replies or read receipts,
  so xyChat can't show them.
- Exports carry no time zone; times are shown exactly as written.
- When an export's day and month order is ambiguous, the import asks you to
  choose.
- System messages and media placeholders are recognized in English. Chats
  exported from a phone in another language still import, but some events may
  appear as plain text.
- iOS may clear a web app's storage when the device is very low on space.
  xyChat requests persistent storage, but keep your exports or a backup.
- Backups over 1 GB may fail on iPhone memory limits; back up chat by chat
  instead.

## How it works

| Layer   | Technology                                                                       |
| ------- | -------------------------------------------------------------------------------- |
| UI      | React, React Router, TanStack Query and Virtual, Tailwind CSS                    |
| Storage | SQLite (WebAssembly) with FTS5 trigram search, in the Origin Private File System |
| Import  | A dedicated worker: streaming zip reader, parser, fingerprint-based merge        |
| Offline | A service worker that precaches the app; static hosting on GitHub Pages          |

The parser is pure TypeScript and covered by golden fixtures and
property-based tests. The whole app is checked with unit, browser and
end-to-end tests, accessibility audits, CSP checks and performance budgets on
every change.

## Development

```sh
pnpm install
pnpm dev         # development server
pnpm verify      # everything CI runs
```

Requires Node (see `.nvmrc`) and pnpm. The design specification is in
[`docs/SPEC.md`](docs/SPEC.md), decisions are recorded in [`docs/adr`](docs/adr),
and [`docs/ROADMAP.md`](docs/ROADMAP.md) lists what's next.

## License

MIT, see [LICENSE](LICENSE). The licenses of the bundled third-party packages
are listed in **Settings → About**. One of them, `codec-parser` (used by the
Opus voice-note fallback), is LGPL-3.0 and ships unmodified.

---

<sub>xyChat is an independent project. It is not affiliated with, endorsed
by or connected to WhatsApp or Meta. "WhatsApp" is a trademark of its owner
and is used here only to describe the export format this app reads.</sub>
