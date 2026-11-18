/**
 * Transactional import commit (AGENTS.md §9.2 step 10): upsert chat,
 * participants, messages (batched), attachments, FTS (via triggers), and
 * chat aggregates — all inside ONE transaction. Re-imports renumber `seq`
 * with the +1e9 offset trick (§10.2).
 */
import {
  asChatId,
  asImportId,
  asParticipantId,
  type ChatId,
  type ParticipantId,
} from '../../core/ids';
import type { ParsedMessage, SourcePlatform } from '../../core/model';
import { formatLocalDateTime } from './local-date-time-parse';
import type { SqliteDatabase } from './open';

/** A message prepared for insertion (fingerprints already computed). */
export interface InsertableMessage {
  readonly fingerprint: string;
  readonly message: ParsedMessage;
}

/** Attachment metadata for one message (bytes stored separately in OPFS). */
export interface InsertableAttachment {
  readonly id: string;
  readonly fingerprintOfMessage: string;
  readonly fileName: string | null;
  readonly mediaType: string;
  readonly mime: string | null;
  readonly byteSize: number | null;
  readonly opfsPath: string | null;
  readonly thumbPath: string | null;
  readonly width: number | null;
  readonly height: number | null;
  readonly durationMs: number | null;
  readonly status: 'present' | 'missing' | 'omitted';
}

/** Import-commit inputs assembled by import.worker (§9.2). */
export interface ImportCommitInput {
  readonly importId: string;
  readonly targetChatId: ChatId | null;
  /** Chat metadata for a NEW chat (ignored when merging into an existing one). */
  readonly newChat: {
    readonly title: string;
    readonly isGroup: boolean;
    readonly sourcePlatform: SourcePlatform;
    readonly dateOrder: 'DMY' | 'MDY' | 'YMD';
  };
  readonly messages: readonly InsertableMessage[];
  readonly attachments: readonly InsertableAttachment[];
  readonly fileName: string;
  readonly fileBytes: number;
  readonly parserVersion: string;
}

/** Outcome counts for the import report (§9.2 step 11). */
export interface ImportCommitResult {
  readonly chatId: ChatId;
  readonly importId: string;
  readonly messagesInserted: number;
  readonly duplicatesSkipped: number;
  readonly attachmentsInserted: number;
}

/** Deterministic participant id from a chat + display name (stable, §10.2). */
function participantIdFor(chatId: ChatId, displayName: string): string {
  // UUID namespace-style: deterministic per (chatId, name) so re-imports
  // upsert instead of duplicating participants.
  const raw = `${chatId}:${displayName}`;
  let h1 = 0x811c9dc5;
  for (let i = 0; i < raw.length; i += 1) {
    h1 = (Math.imul(h1 ^ raw.charCodeAt(i), 0x01000193) >>> 0) % 0x100000000;
  }
  let h2 = 0x01000193;
  for (let i = raw.length - 1; i >= 0; i -= 1) {
    h2 = (Math.imul(h2 ^ raw.charCodeAt(i), 0x811c9dc5) >>> 0) % 0x100000000;
  }
  const hex = (n: number): string => n.toString(16).padStart(8, '0');
  return `${hex(h1).slice(0, 8)}-${hex(h1 ^ h2).slice(0, 4)}-4${hex(h2).slice(0, 3)}-8${hex(h1 ^ 0xa5a5a5a5).slice(0, 3)}-${hex(h2)}${hex(h1).slice(0, 4)}` as ParticipantId;
}

/** Color index = stable hash of the display name modulo palette size (§10.2). */
function colorIndexFor(displayName: string): number {
  let h = 0;
  for (let i = 0; i < displayName.length; i += 1) {
    h = Math.imul(h ^ displayName.charCodeAt(i), 0x01000193) >>> 0;
  }
  return h % 12;
}

/** Inserts or updates one participant; returns its id. */
function upsertParticipant(db: SqliteDatabase, chatId: ChatId, displayName: string): ParticipantId {
  const id = participantIdFor(chatId, displayName);
  db.run(
    `INSERT INTO participants (id, chat_id, display_name, color_index, message_count)
     VALUES (?, ?, ?, ?, 0)
     ON CONFLICT(chat_id, display_name) DO UPDATE SET display_name = excluded.display_name`,
    [id, chatId, displayName, colorIndexFor(displayName)],
  );
  return asParticipantId(id);
}

/** Step 0: register the in_progress import row (§9.2 step 10). */
function registerImport(db: SqliteDatabase, input: ImportCommitInput, now: string): void {
  db.run(
    `INSERT INTO imports (id, chat_id, file_name, file_bytes, status, parser_version, started_at)
     VALUES (?, ?, ?, ?, 'in_progress', ?, ?)`,
    [input.importId, input.targetChatId, input.fileName, input.fileBytes, input.parserVersion, now],
  );
}

/** Step 1: resolve the target chat — reuse or create (§12.8 target). */
function resolveTargetChat(db: SqliteDatabase, input: ImportCommitInput, now: string): ChatId {
  if (input.targetChatId !== null) {
    return input.targetChatId;
  }
  const chatId = asChatId(crypto.randomUUID());
  db.run(
    `INSERT INTO chats (id, title, is_group, self_participant_id, source_platform, date_order,
        message_count, media_count, media_bytes, created_at, updated_at)
     VALUES (?, ?, ?, NULL, ?, ?, 0, 0, 0, ?, ?)`,
    [
      chatId,
      input.newChat.title,
      input.newChat.isGroup ? 1 : 0,
      input.newChat.sourcePlatform,
      input.newChat.dateOrder,
      now,
      now,
    ],
  );
  db.run('UPDATE imports SET chat_id = ? WHERE id = ?', [chatId, input.importId]);
  return chatId;
}

/** Step 4: insert messages with occurrence-counted fingerprints (§8.10). */
function insertMessages(
  db: SqliteDatabase,
  input: ImportCommitInput,
  chatId: ChatId,
): { readonly messagesInserted: number; readonly duplicatesSkipped: number } {
  const existing = db.selectObjects('SELECT fingerprint FROM messages WHERE chat_id = ?', [chatId]);
  const existingSet = new Set(existing.map((r) => String(r['fingerprint'])));
  // Renumber trick: existing seq get +1e9 so inserts never collide (§10.2).
  db.run('UPDATE messages SET seq = seq + 1000000000 WHERE chat_id = ?', [chatId]);
  const minRow = db.selectObjects('SELECT MIN(seq) AS s FROM messages WHERE chat_id = ?', [
    chatId,
  ])[0];
  const minSeq = minRow === undefined || minRow['s'] === null ? null : Number(minRow['s']);
  let maxSeq = minSeq === null ? -1 : minSeq - 1000000000 - 1;

  const seenFingerprints = new Map<string, number>();
  const authors = new Map<string, ParticipantId>();
  let messagesInserted = 0;
  let duplicatesSkipped = 0;

  for (const item of input.messages) {
    const occurrence = seenFingerprints.get(item.fingerprint) ?? 0;
    seenFingerprints.set(item.fingerprint, occurrence + 1);
    const fingerprintWithOccurrence =
      occurrence > 0 ? `${item.fingerprint}-${occurrence}` : item.fingerprint;
    if (existingSet.has(fingerprintWithOccurrence)) {
      duplicatesSkipped += 1;
      continue;
    }
    const m = item.message;
    const tsLocal = formatLocalDateTime(m.timestamp);
    let authorId: ParticipantId | null = null;
    if (m.author !== null) {
      const mapped = authors.get(m.author);
      if (mapped !== undefined) {
        authorId = mapped;
      } else {
        authorId = upsertParticipant(db, chatId, m.author);
        authors.set(m.author, authorId);
      }
      db.run('UPDATE participants SET message_count = message_count + 1 WHERE id = ?', [authorId]);
    }
    const extraJson =
      m.poll !== null
        ? JSON.stringify(m.poll)
        : m.location !== null
          ? JSON.stringify(m.location)
          : null;
    maxSeq += 1;
    db.run(
      `INSERT INTO messages (id, chat_id, fingerprint, seq, ts_local, ts_key, author_id, kind, body, is_edited, extra_json, import_id)
       VALUES (NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        chatId,
        fingerprintWithOccurrence,
        maxSeq,
        tsLocal,
        tsLocalToKey(m.timestamp),
        authorId,
        m.kind,
        m.body,
        m.isEdited ? 1 : 0,
        extraJson,
        input.importId,
      ],
    );
    messagesInserted += 1;
  }
  return { messagesInserted, duplicatesSkipped };
}

/** Step 5: insert attachment records (bytes live in OPFS, §10.4). */
function insertAttachments(db: SqliteDatabase, input: ImportCommitInput, chatId: ChatId): number {
  const messageIdByFingerprint = new Map<string, number>();
  for (const row of db.selectObjects('SELECT id, fingerprint FROM messages WHERE chat_id = ?', [
    chatId,
  ])) {
    messageIdByFingerprint.set(String(row['fingerprint']), Number(row['id']));
  }
  let inserted = 0;
  for (const a of input.attachments) {
    const messageId = messageIdByFingerprint.get(a.fingerprintOfMessage);
    if (messageId === undefined) {
      continue;
    }
    db.run(
      `INSERT INTO attachments (id, message_id, chat_id, file_name, media_type, mime, byte_size, opfs_path, thumb_path, width, height, duration_ms, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        a.id,
        messageId,
        chatId,
        a.fileName,
        a.mediaType,
        a.mime,
        a.byteSize,
        a.opfsPath,
        a.thumbPath,
        a.width,
        a.height,
        a.durationMs,
        a.status,
      ],
    );
    inserted += 1;
  }
  return inserted;
}

/** Step 6: renumber seq back to 0..n-1 after the offset trick. */
function renumberSeq(db: SqliteDatabase, chatId: ChatId): void {
  db.run('UPDATE messages SET seq = seq - 1000000000 WHERE chat_id = ? AND seq >= 1000000000', [
    chatId,
  ]);
}

/** Step 7: recompute chat aggregates inside the transaction (§10.2). */
function updateChatAggregates(db: SqliteDatabase, chatId: ChatId, now: string): void {
  const agg =
    db.selectObjects(
      `SELECT COUNT(*) AS n, COALESCE(MIN(ts_key), NULL) AS first, COALESCE(MAX(ts_key), NULL) AS last
     FROM messages WHERE chat_id = ?`,
      [chatId],
    )[0] ?? {};
  const lastPreview = db.selectObjects(
    'SELECT body FROM messages WHERE chat_id = ? ORDER BY seq DESC LIMIT 1',
    [chatId],
  )[0]?.['body'];
  const media =
    db.selectObjects(
      `SELECT COUNT(*) AS n, COALESCE(SUM(COALESCE(byte_size, 0)), 0) AS bytes
     FROM attachments WHERE chat_id = ? AND status = 'present'`,
      [chatId],
    )[0] ?? {};
  const firstTsKey =
    agg['first'] === null || agg['first'] === undefined ? null : Number(agg['first']);
  const lastTsKey = agg['last'] === null || agg['last'] === undefined ? null : Number(agg['last']);
  db.run(
    `UPDATE chats SET message_count = ?, media_count = ?, media_bytes = ?, first_ts_key = ?, last_ts_key = ?, last_message_preview = ?, updated_at = ?
     WHERE id = ?`,
    [
      Number(agg['n'] ?? 0),
      Number(media['n'] ?? 0),
      Number(media['bytes'] ?? 0),
      firstTsKey,
      lastTsKey,
      typeof lastPreview === 'string' ? lastPreview.slice(0, 120) : null,
      now,
      chatId,
    ],
  );
}

/**
 * Commits an import in ONE transaction (§9.2 step 10).
 *
 * @param db The open database (owned by db.worker).
 * @param input The assembled commit inputs.
 * @returns The counts for the import report.
 */
export function commitImport(db: SqliteDatabase, input: ImportCommitInput): ImportCommitResult {
  const now = new Date().toISOString().replace(/\.\d{3}Z$/u, 'Z');
  let result: ImportCommitResult | undefined;

  db.transaction(() => {
    registerImport(db, input, now);
    const chatId = resolveTargetChat(db, input, now);
    const inserted = insertMessages(db, input, chatId);
    const insertedAttachmentsCount = insertAttachments(db, input, chatId);
    renumberSeq(db, chatId);
    updateChatAggregates(db, chatId, now);
    db.run("UPDATE imports SET status = 'complete', finished_at = ? WHERE id = ?", [
      now,
      input.importId,
    ]);
    result = {
      chatId,
      importId: asImportId(input.importId),
      messagesInserted: inserted.messagesInserted,
      duplicatesSkipped: inserted.duplicatesSkipped,
      attachmentsInserted: insertedAttachmentsCount,
    };
  });

  if (result === undefined) {
    throw new Error('import commit produced no result');
  }
  return result;
}

/** Wall-clock-as-UTC seconds (§10.2 ts_key). */
function tsLocalToKey(t: {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}): number {
  return Date.UTC(t.year, t.month - 1, t.day, t.hour, t.minute, t.second) / 1000;
}
