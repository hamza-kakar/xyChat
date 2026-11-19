/**
 * Transactional import commit (AGENTS.md §9.2 step 10, §8.10): applies a
 * planMerge of the stored chat and the incoming export inside ONE
 * transaction — stored rows are re-sequenced via the +1e9 offset trick,
 * incoming rows are inserted at their final positions, media upgrades fill
 * stored attachment rows, and chat aggregates are recomputed in-transaction
 * (§10.2).
 */
import type { ParticipantId } from '../../core/ids';
import type { ParsedMessage, SourcePlatform } from '../../core/model';
import { planMerge, type MergeEntry } from '../../core/merge';
import { formatLocalDateTime } from './local-date-time-parse';
import type { SqliteDatabase } from './open';

/** A message prepared for insertion (fingerprint already §8.10-complete). */
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

/** Inputs for creating the in_progress import row (§9.3: created before
 * media writes so crash rollback can find it). */
export interface ImportRecordInput {
  readonly importId: string;
  readonly fileName: string;
  readonly fileBytes: number;
  readonly parserVersion: string;
}

/** Import-commit inputs assembled by import.worker (§9.2). */
export interface ImportCommitInput {
  readonly importId: string;
  readonly targetChatId: string | null;
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
  readonly chatId: string;
  readonly importId: string;
  readonly messagesInserted: number;
  readonly duplicatesSkipped: number;
  readonly attachmentsInserted: number;
  readonly mediaUpgraded: number;
}

/** Creates the in_progress import row — call BEFORE media writes (§9.3). */
export function createImportRecord(db: SqliteDatabase, input: ImportRecordInput): void {
  const now = new Date().toISOString().replace(/\.\d{3}Z$/u, 'Z');
  db.run(
    `INSERT INTO imports (id, chat_id, file_name, file_bytes, status, parser_version, started_at)
     VALUES (?, NULL, ?, ?, 'in_progress', ?, ?)`,
    [input.importId, input.fileName, input.fileBytes, input.parserVersion, now],
  );
}

/** Deterministic participant id from a chat + display name (stable, §10.2). */
function participantIdFor(chatId: string, displayName: string): string {
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
  return `${hex(h1).slice(0, 8)}-${hex(h1 ^ h2).slice(0, 4)}-4${hex(h2).slice(0, 3)}-8${hex(h1 ^ 0xa5a5a5a5).slice(0, 3)}-${hex(h2)}${hex(h1).slice(0, 4)}`;
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
function upsertParticipant(db: SqliteDatabase, chatId: string, displayName: string): ParticipantId {
  const id = participantIdFor(chatId, displayName);
  db.run(
    `INSERT INTO participants (id, chat_id, display_name, color_index, message_count)
     VALUES (?, ?, ?, ?, 0)
     ON CONFLICT(chat_id, display_name) DO UPDATE SET display_name = excluded.display_name`,
    [id, chatId, displayName, colorIndexFor(displayName)],
  );
  return id as ParticipantId;
}

/** Step 1: resolve the target chat — reuse or create (§12.8 target). */
function resolveTargetChat(db: SqliteDatabase, input: ImportCommitInput, now: string): string {
  if (input.targetChatId !== null) {
    return input.targetChatId;
  }
  const chatId = crypto.randomUUID();
  db.run(
    `INSERT INTO chats (id, title, is_group, self_participant_id, source_platform, date_order,
        message_count, media_count, media_bytes, created_at, updated_at)
     VALUES (?, ?, ?, NULL, ?, ?, 0, 0, 0, ?, ?)`,
    [chatId, input.newChat.title, input.newChat.isGroup ? 1 : 0, input.newChat.sourcePlatform, input.newChat.dateOrder, now, now],
  );
  db.run('UPDATE imports SET chat_id = ? WHERE id = ?', [chatId, input.importId]);
  return chatId;
}

/** Stored-side entry for planMerge, loaded from the database. */
interface StoredEntry {
  readonly rowId: number;
  readonly fingerprint: string;
  readonly seq: number;
  readonly tsKey: number;
  readonly attachmentWasStored: boolean;
}

/** Loads stored messages as MergeEntry inputs (§9.2 step 7). */
function loadStoredEntries(db: SqliteDatabase, chatId: string): readonly StoredEntry[] {
  const rows = db.selectObjects(
    `SELECT m.id AS row_id, m.fingerprint, m.seq, m.ts_key,
            EXISTS(SELECT 1 FROM attachments a WHERE a.message_id = m.id AND a.status = 'present') AS stored
     FROM messages m WHERE m.chat_id = ? ORDER BY m.seq`,
    [chatId],
  );
  return rows.map((row) => ({
    rowId: Number(row['row_id']),
    fingerprint: String(row['fingerprint']),
    seq: Number(row['seq']),
    tsKey: Number(row['ts_key']),
    attachmentWasStored: Number(row['stored']) === 1,
  }));
}

/** Wall-clock-as-UTC seconds (§10.2 ts_key). */
function tsLocalToKey(t: {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
}): number {
  return Date.UTC(t.year, t.month - 1, t.day, t.hour, t.minute, t.second) / 1000;
}

/** Step 4: applies the planMerge — stored rows re-sequenced, incoming rows
 * inserted, media upgrades applied (§8.10 rules 1–3, §9.2 step 10). */
function applyPlan(
  db: SqliteDatabase,
  input: ImportCommitInput,
  chatId: string,
  stored: readonly StoredEntry[],
): { readonly messagesInserted: number; readonly duplicatesSkipped: number; readonly mediaUpgraded: number } {
  // Offset existing seq so UPDATEs to final positions never collide (§10.2).
  db.run('UPDATE messages SET seq = seq + 1000000000 WHERE chat_id = ?', [chatId]);

  const incomingByFingerprint = new Map<string, (typeof input.messages)[number]>();
  for (const item of input.messages) {
    // First occurrence wins for identical fingerprints (occurrence is
    // already baked into the fingerprint itself at computation time).
    if (!incomingByFingerprint.has(item.fingerprint)) {
      incomingByFingerprint.set(item.fingerprint, item);
    }
  }

  const incomingEntries: MergeEntry[] = input.messages.map((item, index) => ({
    fingerprint: item.fingerprint,
    message: item.message,
    tsKey: tsLocalToKey(item.message.timestamp),
    attachmentWasStored: false,
  }));
  const storedEntries: MergeEntry[] = stored.map((s) => ({
    fingerprint: s.fingerprint,
    message: {
      seq: s.seq,
      sourceLine: 0,
      timestamp: { year: 1970, month: 1, day: 1, hour: 0, minute: 0, second: 0 },
      author: null,
      kind: 'text',
      body: '',
      isEdited: false,
      attachment: null,
      poll: null,
      location: null,
    },
    tsKey: s.tsKey,
    attachmentWasStored: s.attachmentWasStored,
  }));

  const plan = planMerge(storedEntries, incomingEntries);

  const attachmentByFingerprint = new Map<string, (typeof input.attachments)[number]>();
  for (const a of input.attachments) {
    if (!attachmentByFingerprint.has(a.fingerprintOfMessage)) {
      attachmentByFingerprint.set(a.fingerprintOfMessage, a);
    }
  }

  let messagesInserted = 0;
  let duplicatesSkipped = 0;
  let mediaUpgraded = 0;

  plan.messages.forEach((merged, finalSeq) => {
    const storedSource = stored.find((s) => s.fingerprint === merged.fingerprint);
    if (!merged.fromIncoming && storedSource !== undefined) {
      // Stored row: move to its final position.
      db.run('UPDATE messages SET seq = ? WHERE rowid = ?', [
        finalSeq,
        storedSource.rowId,
      ]);
      // Media upgrade: the export twin newly provides bytes the stored row
      // lacked — fill the stored attachment record from the twin.
      const twinFp = merged.fingerprintOfIncomingTwin;
      const upgrade = twinFp === null ? undefined : attachmentByFingerprint.get(twinFp);
      if (upgrade !== undefined) {
        db.run(
          `UPDATE attachments SET status = 'present', opfs_path = ?, mime = ?, byte_size = ?
           WHERE message_id = ? AND status IN ('omitted', 'missing')`,
          [upgrade.opfsPath, upgrade.mime, upgrade.byteSize, storedSource.rowId],
        );
        mediaUpgraded += 1;
      }
      return;
    }
    if (storedSource !== undefined) {
      // Incoming twin of a stored message was dropped by rule 1 (already
      // emitted from the stored side) — not a new row.
      return;
    }
    const item = incomingByFingerprint.get(merged.fingerprint);
    if (item === undefined) {
      return;
    }
    const m = item.message;
    const tsLocal = formatLocalDateTime(m.timestamp);
    let authorId: string | null = null;
    if (m.author !== null) {
      authorId = upsertParticipant(db, chatId, m.author);
      db.run('UPDATE participants SET message_count = message_count + 1 WHERE id = ?', [authorId]);
    }
    const extraJson =
      m.poll !== null
        ? JSON.stringify(m.poll)
        : m.location !== null
          ? JSON.stringify(m.location)
          : null;
    db.run(
      `INSERT INTO messages (id, chat_id, fingerprint, seq, ts_local, ts_key, author_id, kind, body, is_edited, extra_json, import_id)
       VALUES (NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        chatId,
        item.fingerprint,
        finalSeq,
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
    const attachment = attachmentByFingerprint.get(item.fingerprint);
    if (attachment !== undefined) {
      const messageRowId = db.lastInsertRowId();
      db.run(
        `INSERT INTO attachments (id, message_id, chat_id, file_name, media_type, mime, byte_size, opfs_path, thumb_path, width, height, duration_ms, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          attachment.id,
          messageRowId,
          chatId,
          attachment.fileName,
          attachment.mediaType,
          attachment.mime,
          attachment.byteSize,
          attachment.opfsPath,
          attachment.thumbPath,
          attachment.width,
          attachment.height,
          attachment.durationMs,
          attachment.status,
        ],
      );
    }
  });

  return {
    messagesInserted,
    duplicatesSkipped: input.messages.length - messagesInserted,
    mediaUpgraded,
  };
}

/** Step 7: recompute chat aggregates inside the transaction (§10.2). */
function updateChatAggregates(db: SqliteDatabase, chatId: string, now: string): void {
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
  const firstTsKey = agg['first'] === null || agg['first'] === undefined ? null : Number(agg['first']);
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
 * Commits an import in ONE transaction (§9.2 step 10, §8.10 semantics).
 *
 * @param db The open database (owned by db.worker).
 * @param input The assembled commit inputs (import row already in_progress —
 *   created before media writes via createImportRecord).
 * @returns The counts for the import report.
 */
export function commitImport(db: SqliteDatabase, input: ImportCommitInput): ImportCommitResult {
  const now = new Date().toISOString().replace(/\.\d{3}Z$/u, 'Z');

  return db.transaction(() => {
    const chatId = resolveTargetChat(db, input, now);
    const stored = loadStoredEntries(db, chatId);
    const counts = applyPlan(db, input, chatId, stored);
    updateChatAggregates(db, chatId, now);
    db.run("UPDATE imports SET status = 'complete', finished_at = ? WHERE id = ?", [
      now,
      input.importId,
    ]);
    return {
      chatId,
      importId: input.importId,
      messagesInserted: counts.messagesInserted,
      duplicatesSkipped: counts.duplicatesSkipped,
      attachmentsInserted: input.attachments.length,
      mediaUpgraded: counts.mediaUpgraded,
    };
  });
}

