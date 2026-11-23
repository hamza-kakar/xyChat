# ADR 0015 — Backup and restore

## Context

M8 implements §10.6: back up all chats or one, with or without media,
into `<name>-backup-YYYYMMDD-HHMM.zip` (manifest, `db.sqlite3` snapshot,
media), and restore with skip / replace / merge per chat under the §9.3
rollback rules. The spec suggests sahpool `exportFile` or `VACUUM INTO` a
temp database in `backup-tmp/` for the snapshot. It leaves open where
the work runs, what the snapshot contains, how ids behave on restore,
and how a backup chat is matched to a local one.

## Decision

- **Snapshot in an in-memory scratch database.** The chosen chats are
  copied (keyset batches) into a fresh in-memory database at the current
  schema and serialized with `sqlite3_js_db_export`. A restore
  deserializes the backup's `db.sqlite3` into another in-memory database.
  The app database keeps its single sahpool connection (§10.1), the
  sahpool needs no extra file slots, and the same code runs in the
  page-context browser tests. The snapshot is held in memory whole; it
  has no full-text index, so it is much smaller than the app database.
  Restores refuse snapshots over 512 MiB.
- **What a backup holds.** Chats, participants, completed imports,
  messages, attachments and bookmarks of the chosen chats. Not the app
  settings in `meta` (PIN hash, lock state, logs, last position): a
  backup is a file that leaves the app, and a restore never changes
  settings. The FTS index is left empty (its triggers stay, so the
  schema is identical); a restore re-indexes as it inserts.
- **Runs in db.worker.** Both need the database, which only db.worker
  opens; import.worker has no database access by design (§3.2). Zip I/O
  is asynchronous, so other queries still interleave. Media is stored in
  the zip without recompression (level 0); the archive streams into
  `backup-tmp/` through a sync access handle.
- **Stateless restore.** "Check the backup" and "Restore" each open the
  picked file, like import detection. The worker keeps nothing between
  them.
- **Restore goes through the import commit.** Each chosen chat becomes an
  import commit input (rows validated with Valibot first, §18.5), so a
  merge follows §8.10 exactly and fingerprints are kept verbatim. All
  chosen chats commit in one transaction; a replace deletes the local
  chat in that transaction first and its files after the commit (§10.4).
  Each chat gets an `in_progress` import row (the backup's file name)
  that lists the files written for it, so cancel, failure and crash clean
  up as in §9.3. The backup's own import history is not carried over: the
  restored chat's history shows the restore. Deleting a chat now also
  removes its finished import rows, so a restored chat that reuses the id
  doesn't inherit stale history.
- **Ids.** A restored chat keeps the backup's chat id when no local chat
  has it, otherwise it gets a new one (so a copy can sit beside the
  original). Attachment ids are always new and media paths are derived
  from them; the backup's paths are only zip entry names and must match
  `media/<id>/<id>.<ext>` or `thumbs/<id>/<id>.jpg`. Participants are
  matched by name, as in imports. Bookmarks are matched by fingerprint;
  on a merge a locally bookmarked message keeps its own note. "Me" comes
  from the backup only when the local chat has none.
- **Matching and choices.** A backup chat matches the local chat with the
  same id, else the same title. A matching chat offers Merge (default:
  nothing is lost), Replace and Skip; any other chat offers Restore
  (default) and Skip.
- **Backups without media.** Attachments that had files restore as
  `missing`; re-importing the original export later fills them in (§8.10
  media upgrade).
- **File name.** `<app name>-backup-YYYYMMDD-HHMM.zip` with the app name
  lower-cased (`APP_NAME` is waChatBack, so `wachatback-backup-…`), in
  device time.
- **Offering the file.** "Share backup" uses `navigator.share({ files })`
  when `navigator.canShare` accepts the file; "Save backup" downloads it
  (Files on iOS). Both need a tap after the backup finishes, since the
  share sheet requires a user gesture. The archive stays in `backup-tmp/`
  until the next backup or the next launch, which clears the folder.
- **Quota.** A restore checks for free space of 1.1× the media it will
  copy, like an import (§9.2 step 1). A backup shows its estimated size
  first and warns above 1 GB (§10.6).
- **Update prompt.** §12.12's suppression during a restore applies to the
  update prompt, which lands in M9; there is no prompt yet to suppress.

## Alternatives considered

- **`VACUUM INTO` / `exportFile` through the sahpool.** Needs more pool
  capacity (or a second sahpool file plus journal), a second connection
  or `ATTACH` on the app database, and pruning settings out of the copy
  afterwards. It can't run in the page-context tests (ADR 0007).
- **Backup in import.worker.** It would need a second channel to
  db.worker for the snapshot and the media list; nothing would get
  faster, since the database part is the same.
- **Carrying the import history over.** Import ids would collide on the
  same device, and merged chats would show the same import twice.

## Consequences

- A backup's snapshot and a restore's database live in worker memory
  while they run. Very large chats are limited by the 512 MiB cap; the
  1 GB warning nudges iPhone users to per-chat backups.
- A restore of many chats is all or nothing.
- The import history of a restored chat starts with the restore.
