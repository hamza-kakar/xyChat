/**
 * Migration 0001 — initial schema (AGENTS.md §10.2). STRICT tables, FTS5
 * trigram external-content index over message bodies, sync triggers, and the
 * §11 search indexes.
 */

import { FTS_TRIGGER_DDL } from '../fts-triggers';

/** SQL for the initial schema; executed by migrate.ts inside a transaction.
 * The FTS sync triggers come from fts-triggers.ts (single DDL source). */
export const SQL_0001_INIT =
  `
CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS chats (
  id                   TEXT PRIMARY KEY,
  title                TEXT NOT NULL,
  is_group             INTEGER NOT NULL CHECK (is_group IN (0,1)),
  self_participant_id  TEXT NULL,
  source_platform      TEXT NOT NULL CHECK (source_platform IN ('ios','android','unknown')),
  date_order           TEXT NOT NULL CHECK (date_order IN ('DMY','MDY','YMD')),
  message_count        INTEGER NOT NULL DEFAULT 0,
  media_count          INTEGER NOT NULL DEFAULT 0,
  media_bytes          INTEGER NOT NULL DEFAULT 0,
  first_ts_key         INTEGER NULL,
  last_ts_key          INTEGER NULL,
  last_message_preview TEXT NULL,
  created_at           TEXT NOT NULL,
  updated_at           TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS participants (
  id             TEXT PRIMARY KEY,
  chat_id        TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  display_name   TEXT NOT NULL,
  color_index    INTEGER NOT NULL,
  message_count  INTEGER NOT NULL DEFAULT 0,
  UNIQUE (chat_id, display_name)
) STRICT;

CREATE TABLE IF NOT EXISTS messages (
  id             INTEGER PRIMARY KEY,
  chat_id        TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  fingerprint    TEXT NOT NULL,
  seq            INTEGER NOT NULL,
  ts_local       TEXT NOT NULL,
  ts_key         INTEGER NOT NULL,
  author_id      TEXT NULL REFERENCES participants(id) ON DELETE CASCADE,
  kind           TEXT NOT NULL CHECK (kind IN ('text','media','system','deleted','call','location','contact','poll')),
  body           TEXT NOT NULL,
  is_edited      INTEGER NOT NULL CHECK (is_edited IN (0,1)),
  extra_json     TEXT NULL,
  import_id      TEXT NOT NULL REFERENCES imports(id),
  UNIQUE (chat_id, fingerprint),
  UNIQUE (chat_id, seq)
) STRICT;

CREATE INDEX IF NOT EXISTS idx_messages_chat_ts
  ON messages(chat_id, ts_key);
CREATE INDEX IF NOT EXISTS idx_messages_chat_author
  ON messages(chat_id, author_id);
CREATE INDEX IF NOT EXISTS idx_messages_chat_kind
  ON messages(chat_id, kind);

CREATE TABLE IF NOT EXISTS attachments (
  id           TEXT PRIMARY KEY,
  message_id   INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  chat_id      TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  file_name    TEXT NULL,
  media_type   TEXT NOT NULL CHECK (media_type IN ('image','video','audio','voice','sticker','gif','document','contact-card','other')),
  mime         TEXT NULL,
  byte_size    INTEGER NULL,
  opfs_path    TEXT NULL,
  thumb_path   TEXT NULL,
  width        INTEGER NULL,
  height       INTEGER NULL,
  duration_ms  INTEGER NULL,
  status       TEXT NOT NULL CHECK (status IN ('present','missing','omitted'))
) STRICT;

CREATE INDEX IF NOT EXISTS idx_attachments_chat_type
  ON attachments(chat_id, media_type, status);

CREATE TABLE IF NOT EXISTS bookmarks (
  id          TEXT PRIMARY KEY,
  chat_id     TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  message_id  INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  note        TEXT NULL,
  created_at  TEXT NOT NULL,
  UNIQUE (message_id)
) STRICT;

CREATE TABLE IF NOT EXISTS imports (
  id                 TEXT PRIMARY KEY,
  chat_id            TEXT NULL,
  file_name          TEXT NOT NULL,
  file_bytes         INTEGER NOT NULL,
  status             TEXT NOT NULL CHECK (status IN ('in_progress','complete','cancelled','failed','rolled_back')),
  parser_version     TEXT NOT NULL,
  started_at         TEXT NOT NULL,
  finished_at        TEXT NULL,
  written_paths_json TEXT NOT NULL DEFAULT '[]',
  report_json        TEXT NULL
) STRICT;

CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
  body,
  content='messages',
  content_rowid='id',
  tokenize='trigram'
);
` + FTS_TRIGGER_DDL;
