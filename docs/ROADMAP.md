# Roadmap

## Released

**1.0.0** (2026-11-23): the first public release. Import, chat view, search,
jump to date, bookmarks, media gallery and voice notes, chat info, settings,
app lock, storage management, backup and restore, and full offline use. See the
[changelog](../CHANGELOG.md) for details.

## Known gaps

- The on-device checklist in [TESTING.md](TESTING.md) has only been run in
  part on a real iPhone. Automated end-to-end tests cover the same flows in
  WebKit and Chromium.
- Playwright's WebKit on Linux can't use private file storage, so the storage
  flows run end to end only in Chromium in CI ([ADR 0007](adr/0007-webkit-e2e-skips-without-opfs.md)).
- Export phrases (system messages, media placeholders) are recognized in
  English only.

## Ideas

- Recognize export phrases from more phone languages (one table per language).
- A guided first run that walks through exporting a chat from WhatsApp.
- Faster re-imports of very large media archives.
