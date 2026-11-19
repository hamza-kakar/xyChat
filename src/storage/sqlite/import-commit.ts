/**
 * Transactional import commit (AGENTS.md §9.2 step 10, §8.10): applies a
 * planMerge of the stored chat and the incoming export inside ONE
 * transaction — stored rows are re-sequenced via the +1e9 offset trick,
 * incoming rows are inserted at their final positions, media upgrades fill
 * stored attachment rows, and chat aggregates are recomputed in-transaction
 * (§10.2).
 */
import type { ParsedMessage, SourcePlatform } from '../../core/model';
import { planMerge, type MergeEntry } from '../../core/merge';
import { formatLocalDateTime } from './local-date-time-parse';
import { tsLocalToKey } from './ts-key';
import type { SqliteDatabase } from './open';
import { upsertParticipant } from './participant-upsert';

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
/** Context shared by the plan-application helpers. */
interface ApplyContext {
  readonly db: SqliteDatabase;
  readonly chatId: string;
  readonly importId: string;
  readonly attachmentByFingerprint: ReadonlyMap<string, InsertableAttachment>;
}
/** Neutral message placeholder for stored entries (plan reads only keys). */
function placeholderStoredMessage(): ParsedMessage {
  return {
    seq: 0,
    sourceLine: 0,
    timestamp: { year: 1970, month: 1, day: 1, hour: 0, minute: 0, second: 0 },
    author: null,
    kind: 'text',
    body: '',
    isEdited: false,
    attachment: null,
    poll: null,
    location: null,
  };
}
/** Step 4: applies the planMerge — stored rows re-sequenced to their final
 * positions, incoming rows inserted, media upgrades applied (§8.10). */
function applyPlan(
  db: SqliteDatabase,
  input: ImportCommitInput,
  chatId: string,
  stored: readonly StoredEntry[],
): {
  readonly messagesInserted: number;
  readonly duplicatesSkipped: number;
  readonly mediaUpgraded: number;
} {
  // Offset existing seq so UPDATEs to final positions never collide (§10.2).
  db.run('UPDATE messages SET seq = seq + 1000000000 WHERE chat_id = ?', [chatId]);

  const incomingByFingerprint = new Map<string, InsertableMessage>();
  for (const item of input.messages) {
    // First occurrence wins for identical fingerprints (occurrence is
    // already baked into the fingerprint itself at computation time).
    if (!incomingByFingerprint.has(item.fingerprint)) {
      incomingByFingerprint.set(item.fingerprint, item);
    }
  }

  const storedEntries: MergeEntry[] = stored.map((s) => ({
    fingerprint: s.fingerprint,
    message: placeholderStoredMessage(),
    tsKey: s.tsKey,
    attachmentWasStored: s.attachmentWasStored,
  }));
  const incomingEntries: MergeEntry[] = input.messages.map((item) => ({
    fingerprint: item.fingerprint,
    message: item.message,
    tsKey: tsLocalToKey(item.message.timestamp),
    attachmentWasStored: false,
  }));

  const plan = planMerge(storedEntries, incomingEntries);
  const attachmentByFingerprint = new Map<string, InsertableAttachment>();
  for (const a of input.attachments) {
    if (!attachmentByFingerprint.has(a.fingerprintOfMessage)) {
      attachmentByFingerprint.set(a.fingerprintOfMessage, a);
    }
  }
  const ctx: ApplyContext = { db, chatId, importId: input.importId, attachmentByFingerprint };

  const storedByFingerprint = new Map<string, StoredEntry>();
  for (const entry of stored) {
    storedByFingerprint.set(entry.fingerprint, entry);
  }

  let messagesInserted = 0;
  let mediaUpgraded = 0;
  plan.messages.forEach((merged, finalSeq) => {
    const storedSource = storedByFingerprint.get(merged.fingerprint);
    if (storedSource !== undefined && !merged.fromIncoming) {
      applyStoredRow(ctx, merged, finalSeq, storedSource.rowId);
      if (countUpgrade(merged, storedSource, attachmentByFingerprint)) {
        mediaUpgraded += 1;
      }
      return;
    }
    if (storedSource !== undefined) {
      // Incoming twin of a stored message: rule 1 already emitted the stored
      // row — nothing to insert.
      return;
    }
    applyIncomingRow(ctx, merged, finalSeq, incomingByFingerprint);
    messagesInserted += 1;
  });

  return {
    messagesInserted,
    duplicatesSkipped: input.messages.length - messagesInserted,
    mediaUpgraded,
  };
}
/** Moves a stored row to its final seq, applying a media upgrade if the
 * incoming twin has newly *present* media (§8.10 rule 1: attach only when
 * newly present — an omitted twin never turns a placeholder into present). */
function applyStoredRow(
  ctx: ApplyContext,
  merged: { readonly fingerprintOfIncomingTwin: string | null },
  finalSeq: number,
  storedRowId: number,
): void {
  ctx.db.run('UPDATE messages SET seq = ? WHERE rowid = ?', [finalSeq, storedRowId]);
  const twinFp = merged.fingerprintOfIncomingTwin;
  if (twinFp === null) {
    return;
  }
  const upgrade = ctx.attachmentByFingerprint.get(twinFp);
  if (upgrade?.status !== 'present') {
    return;
  }
  // Copy the full set of file fields so the stored record is complete.
  ctx.db.run(
    `UPDATE attachments SET status = 'present', opfs_path = ?, thumb_path = ?,
            mime = ?, byte_size = ?, width = ?, height = ?, file_name = ?
     WHERE message_id = ? AND status IN ('omitted', 'missing')`,
    [
      upgrade.opfsPath,
      upgrade.thumbPath,
      upgrade.mime,
      upgrade.byteSize,
      upgrade.width,
      upgrade.height,
      upgrade.fileName,
      storedRowId,
    ],
  );
}
/** Counts whether a rule-1 merge performed a media upgrade — the incoming
 * twin must have newly *present* media (§8.10: an omitted twin is a no-op). */
function countUpgrade(
  merged: { readonly fingerprintOfIncomingTwin: string | null },
  storedSource: StoredEntry,
  attachmentByFingerprint: ReadonlyMap<string, InsertableAttachment>,
): boolean {
  if (storedSource.attachmentWasStored || merged.fingerprintOfIncomingTwin === null) {
    return false;
  }
  const upgrade = attachmentByFingerprint.get(merged.fingerprintOfIncomingTwin);
  return upgrade?.status === 'present';
}
/** Inserts an incoming-only message (and its attachment record). */
function applyIncomingRow(
  ctx: ApplyContext,
  merged: { readonly fingerprint: string; readonly message: ParsedMessage },
  finalSeq: number,
  incomingByFingerprint: ReadonlyMap<string, InsertableMessage>,
): void {
  const item = incomingByFingerprint.get(merged.fingerprint);
  if (item === undefined) {
    return;
  }
  const m = item.message;
  const tsLocal = formatLocalDateTime(m.timestamp);
  let authorId: string | null = null;
  if (m.author !== null) {
    authorId = upsertParticipant(ctx.db, ctx.chatId, m.author);
    ctx.db.run('UPDATE participants SET message_count = message_count + 1 WHERE id = ?', [
      authorId,
    ]);
  }
  const extraJson =
    m.poll !== null
      ? JSON.stringify(m.poll)
      : m.location !== null
        ? JSON.stringify(m.location)
        : null;
  ctx.db.run(
    `INSERT INTO messages (id, chat_id, fingerprint, seq, ts_local, ts_key, author_id, kind, body, is_edited, extra_json, import_id)
     VALUES (NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      ctx.chatId,
      item.fingerprint,
      finalSeq,
      tsLocal,
      tsLocalToKey(m.timestamp),
      authorId,
      m.kind,
      m.body,
      m.isEdited ? 1 : 0,
      extraJson,
      ctx.importId,
    ],
  );
  const attachment = ctx.attachmentByFingerprint.get(item.fingerprint);
  if (attachment !== undefined) {
    const messageRowId = ctx.db.lastInsertRowId();
    ctx.db.run(
      `INSERT INTO attachments (id, message_id, chat_id, file_name, media_type, mime, byte_size, opfs_path, thumb_path, width, height, duration_ms, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        attachment.id,
        messageRowId,
        ctx.chatId,
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
