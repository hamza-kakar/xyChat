<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/banner-dark.png">
    <img src="docs/banner-light.png" alt="xyChat: your chat exports, readable forever. Private, offline, on your own device." width="100%">
  </picture>
</p>

<p align="center">
  <a href="https://github.com/hamza-kakar/xyChat/actions/workflows/ci.yml"><img src="https://github.com/hamza-kakar/xyChat/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/hamza-kakar/xyChat/releases/latest"><img src="https://img.shields.io/github/v/release/hamza-kakar/xyChat?sort=semver" alt="Latest release"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT license"></a>
</p>

xyChat opens the chats you export from WhatsApp (**Export Chat**) and shows them
the way you remember them: bubbles, photos, voice notes and search, even years
later and in airplane mode.

xyChat is a web app you install on your phone or computer (a PWA). There is
no server and no account: your chats are stored inside the app on your
device, so **they never leave it.**

**Open the app:** <https://hamza-kakar.github.io/xyChat/>

<div align="center">
<table>
  <tr>
    <td align="center">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/readme/chats-dark.png">
        <img src="docs/screenshots/readme/chats-light.png" alt="Chat list" width="180">
      </picture>
      <br><sub><b>Chat list</b></sub>
    </td>
    <td align="center">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/readme/chat-dark.png">
        <img src="docs/screenshots/readme/chat-light.png" alt="Chat view" width="180">
      </picture>
      <br><sub><b>Chat view</b></sub>
    </td>
    <td align="center">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/readme/search-dark.png">
        <img src="docs/screenshots/readme/search-light.png" alt="Search" width="180">
      </picture>
      <br><sub><b>Search</b></sub>
    </td>
    <td align="center">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/readme/gallery-dark.png">
        <img src="docs/screenshots/readme/gallery-light.png" alt="Media gallery" width="180">
      </picture>
      <br><sub><b>Media</b></sub>
    </td>
    <td align="center">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/readme/info-dark.png">
        <img src="docs/screenshots/readme/info-light.png" alt="Chat info" width="180">
      </picture>
      <br><sub><b>Chat info</b></sub>
    </td>
  </tr>
</table>
<sub>A made-up demo chat. Screenshots follow your GitHub theme (light or dark).</sub>
</div>

## Features

- Chat bubbles with day separators, sender colors and WhatsApp text formatting
- Photos, videos, documents and voice notes (including `.opus` on iPhone)
- Fast search across all chats, jump to a date, bookmarks with notes
- Smooth scrolling through chats with 100,000+ messages
- iOS and Android exports, `.zip` with media or plain `.txt`
- Re-import a newer export and only the new messages are added
- Optional PIN lock, light and dark themes, right-to-left languages
- Backup and restore as a single file

## Install on iPhone

Requires iOS 17 or later.

1. Open <https://hamza-kakar.github.io/xyChat/> in Safari.
2. Tap **Share → Add to Home Screen → Add**.
3. Open xyChat from your Home Screen.

Install it before importing: on iPhone, the Home Screen app keeps its own
chats, separate from Safari, so chats imported in a Safari tab won't appear in
the app.

## Install on Android or a computer

Open the same address in Chrome or Edge and choose **Install app** (in the
menu or the address bar). You can also use it in a normal tab.

## Import a chat

1. In WhatsApp, open the chat and choose **Export Chat**, with or without media.
2. Save the export to **Files** or your device storage.
3. In xyChat, tap **+**, choose the export, confirm the date format and which
   person is you, and start the import.

To try it first, download the made-up
[demo export](https://github.com/hamza-kakar/xyChat/raw/main/docs/demo/WhatsApp%20Chat%20-%20Hunza%20Trip.zip)
and import it the same way (pick **Sam** as yourself).

## Privacy

- Your chats are never sent anywhere: a strict Content Security Policy lets
  the app load only its own files.
- No accounts, cloud sync, analytics or ads.
- The PIN hides the app; it is not encryption. Backup files are not encrypted
  either.
- Keep your original exports: you can always import them again.

## FAQ

**Does it upload my chats?** No. There is no server, and the app works fully
offline once installed.

**What if I delete the app?** Your imported chats are deleted with it. Keep
your exports or a backup file.

**Why are reactions and quoted replies missing?** WhatsApp's export doesn't
include them.

**"This browser isn't supported" after a quick relaunch?** A known issue: close
the app completely and open it again. A fix is planned.

**A fix isn't showing after an update?** Tap **Reload** when **Update
available** appears, or close and reopen the app. Your version is in
**Settings → Diagnostics**.

More limitations and plans are in [docs/ROADMAP.md](docs/ROADMAP.md).

## Development

```sh
pnpm install
pnpm dev       # development server
pnpm verify    # everything CI runs
```

Requires Node 24+ and pnpm 12+. Built with React, TypeScript and SQLite
(WebAssembly), stored in the Origin Private File System (OPFS). See
[CONTRIBUTING.md](CONTRIBUTING.md), and report security issues privately as
described in [SECURITY.md](SECURITY.md).

## License

MIT, see [LICENSE](LICENSE). Third-party licenses are listed in **Settings →
About**.

<sub>xyChat is an independent project, not affiliated with WhatsApp or Meta.</sub>
