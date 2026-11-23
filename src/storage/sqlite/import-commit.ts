/**
 * Transactional import commit (AGENTS.md §9.2 step 10, §8.10): resolves the
 * target chat, applies the planMerge of the stored chat and the incoming
 * export inside ONE transaction (see import-commit-apply.ts), recomputes
 * chat aggregates in-transaction (§10.2), and marks the import complete.
 */
import type { ParsedMessage, SourcePlatform } from '../../core/model';
import type { SqliteDatabase } from './open';
import { applyPlan, loadStoredEntries } from './import-commit-apply';
import type { ImportReport, ImportRunFacts } from './import-report';

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
  /** Run facts for the stored report (§9.2 step 11). */
  readonly report: ImportRunFacts;
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

/** Step 1: resolve the target chat — reuse or create (§12.8 target). The
 * media phase keys OPFS paths on the chat id BEFORE the commit (§9.2 step
 * 8), so the UI mints the id up front: a pre-minted id inserts its chats
 * row here (INSERT OR IGNORE keeps an existing chat's title on merges); a
 * null target mints one now. */
function resolveTargetChat(db: SqliteDatabase, input: ImportCommitInput, now: string): string {
  const chatId = input.targetChatId ?? crypto.randomUUID();
  db.run(
    `INSERT OR IGNORE INTO chats (id, title, is_group, self_participant_id, source_platform, date_order,
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

/** The commit's timestamp format: ISO-8601 UTC without milliseconds. */
export function commitTimestamp(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/u, 'Z');
}

/**
 * Applies an import inside the CALLER's transaction (§9.2 step 10): the
 * restore path (§10.6) commits several chats atomically with it.
 *
 * @param db The open database, inside a transaction.
 * @param input The assembled commit inputs (import row already in_progress).
 * @param now The commit timestamp ({@link commitTimestamp}).
 * @returns The counts for the import report.
 */
export function applyImportCommit(
  db: SqliteDatabase,
  input: ImportCommitInput,
  now: string,
): ImportCommitResult {
  const chatId = resolveTargetChat(db, input, now);
  const stored = loadStoredEntries(db, chatId);
  const counts = applyPlan(db, input, chatId, stored);
  updateChatAggregates(db, chatId, now);
  const report: ImportReport = {
    ...input.report,
    messagesAdded: counts.messagesInserted,
    duplicatesSkipped: counts.duplicatesSkipped,
    mediaUpgraded: counts.mediaUpgraded,
  };
  db.run("UPDATE imports SET status = 'complete', finished_at = ?, report_json = ? WHERE id = ?", [
    now,
    JSON.stringify(report),
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
  const now = commitTimestamp();
  return db.transaction(() => applyImportCommit(db, input, now));
}
