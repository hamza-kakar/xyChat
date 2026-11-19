/**
 * Plan application for import commits (AGENTS.md §8.10, §9.2 step 10): walks
 * the planMerge output, re-sequences stored rows that the plan displaces,
 * inserts incoming-only rows at their final positions, and applies media
 * upgrades for twins whose export newly provides bytes.
 *
 * Sequencing strategy (§10.2, §17 budgets): the plan is computed first, so
 * rows whose position does not change are never touched — a stable re-import
 * re-sequences nothing. Only displaced stored rows take the +1e9 offset
 * trick, and incoming rows insert at their FINAL seq after displaced rows
 * vacated theirs, so no transient UNIQUE(chat_id, seq) state can collide.
 */
import type { ParsedMessage } from '../../core/model';
import { planMerge, type MergeEntry, type MergedMessage } from '../../core/merge';
import { tsLocalToKey } from './ts-key';
import type { SqliteDatabase } from './open';
import type { ImportCommitInput, InsertableAttachment, InsertableMessage } from './import-commit';
import { applyIncomingRow, type ApplyContext } from './import-commit-insert';

/** Stored-side entry loaded from the database for planMerge. */
export interface StoredEntry {
  readonly rowId: number;
  readonly fingerprint: string;
  readonly seq: number;
  readonly tsKey: number;
  /** True when a stored attachment row already has its media bytes. */
  readonly attachmentWasStored: boolean;
}

/** A stored row the plan moved to a different position. */
interface DisplacedRow {
  readonly rowId: number;
  readonly finalSeq: number;
}

/** The plan walk's write plan: displaced stored rows and incoming inserts. */
interface PlanActions {
  readonly displaced: readonly DisplacedRow[];
  readonly incomingFinals: readonly {
    readonly merged: MergedMessage;
    readonly finalSeq: number;
  }[];
  readonly mediaUpgraded: number;
}

/** Neutral message placeholder for stored entries (plan reads only keys). */
const PLACEHOLDER_STORED_MESSAGE: ParsedMessage = Object.freeze({
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
});

/** Loads stored messages as MergeEntry inputs (§9.2 step 7). Presence of
 * stored media comes from ONE scan of the (usually small) attachments set
 * instead of a correlated EXISTS per message row; rows arrive as positional
 * arrays — the cheap shape for a 100k-row scan (§17). */
export function loadStoredEntries(db: SqliteDatabase, chatId: string): readonly StoredEntry[] {
  const rows = db.selectArrays(
    'SELECT id, fingerprint, seq, ts_key FROM messages WHERE chat_id = ? ORDER BY seq',
    [chatId],
  );
  const presentMessageIds = new Set(
    db
      .selectArrays("SELECT message_id FROM attachments WHERE chat_id = ? AND status = 'present'", [
        chatId,
      ])
      .map((row) => Number(row[0])),
  );
  return rows.map((row) => ({
    rowId: Number(row[0]),
    fingerprint: String(row[1]),
    seq: Number(row[2]),
    tsKey: Number(row[3]),
    attachmentWasStored: presentMessageIds.has(Number(row[0])),
  }));
}

/** Builds the two MergeEntry lists for planMerge: the stored chat and the
 * incoming export (presence = the export provides bytes for the message). */
function buildMergeInputs(
  stored: readonly StoredEntry[],
  input: Pick<ImportCommitInput, 'messages' | 'attachments'>,
  attachmentByFingerprint: ReadonlyMap<string, InsertableAttachment>,
): { readonly storedEntries: MergeEntry[]; readonly incomingEntries: MergeEntry[] } {
  const storedEntries: MergeEntry[] = stored.map((entry) => ({
    fingerprint: entry.fingerprint,
    message: PLACEHOLDER_STORED_MESSAGE,
    tsKey: entry.tsKey,
    attachmentStored: entry.attachmentWasStored,
  }));

  const incomingEntries: MergeEntry[] = input.messages.map((item) => ({
    fingerprint: item.fingerprint,
    message: item.message,
    tsKey: tsLocalToKey(item.message.timestamp),
    attachmentStored: attachmentByFingerprint.get(item.fingerprint)?.status === 'present',
  }));

  return { storedEntries, incomingEntries };
}

/** Pass 1 over the plan: applies media upgrades to stored rows and collects
 * the displaced rows and the incoming-only rows (with final positions). */
function collectPlanActions(
  ctx: ApplyContext,
  plan: ReturnType<typeof planMerge>,
  stored: readonly StoredEntry[],
): PlanActions {
  const storedByFingerprint = new Map<string, StoredEntry>();
  for (const entry of stored) {
    storedByFingerprint.set(entry.fingerprint, entry);
  }

  const displaced: DisplacedRow[] = [];
  const incomingFinals: { merged: MergedMessage; finalSeq: number }[] = [];
  let mediaUpgraded = 0;
  plan.messages.forEach((merged, finalSeq) => {
    const storedSource = storedByFingerprint.get(merged.fingerprint);
    if (storedSource !== undefined && !merged.fromIncoming) {
      applyStoredUpgrade(ctx, merged, storedSource.rowId);
      if (finalSeq !== storedSource.seq) {
        displaced.push({ rowId: storedSource.rowId, finalSeq });
      }
      if (countUpgrade(merged, storedSource.attachmentWasStored, ctx.attachmentByFingerprint)) {
        mediaUpgraded += 1;
      }
      return;
    }
    if (storedSource !== undefined) {
      // Incoming twin of a stored message: rule 1 already emitted the stored
      // row — nothing to insert.
      return;
    }
    incomingFinals.push({ merged, finalSeq });
  });

  return { displaced, incomingFinals, mediaUpgraded };
}

/** Applies a media upgrade when the incoming twin has newly *present* media
 * (§8.10 rule 1: an omitted twin never turns a placeholder into present
 * media). The seq update happens in resequenceDisplacedRows. */
function applyStoredUpgrade(ctx: ApplyContext, merged: MergedMessage, storedRowId: number): void {
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
  merged: MergedMessage,
  storedHadMedia: boolean,
  attachmentByFingerprint: ReadonlyMap<string, InsertableAttachment>,
): boolean {
  if (storedHadMedia || merged.fingerprintOfIncomingTwin === null) {
    return false;
  }
  const upgrade = attachmentByFingerprint.get(merged.fingerprintOfIncomingTwin);
  return upgrade?.status === 'present';
}

/** Moves displaced stored rows to their final seq (§10.2 offset trick):
 * first bumps the displaced rows out of the low-seq range (vacating their
 * old positions), then updates them to their final positions in batched
 * UPDATE ... FROM VALUES statements. Undisplaced rows are never touched —
 * a stable re-import re-sequences nothing. */
function resequenceDisplacedRows(db: SqliteDatabase, displaced: readonly DisplacedRow[]): void {
  if (displaced.length === 0) {
    return;
  }

  // 1e9 + original seq is unique per chat, so the bump itself collides with
  // nothing (§10.2). Rowid IN lists resolve through rowid seeks.
  const ROWS_PER_BATCH = 8_000;
  for (let start = 0; start < displaced.length; start += ROWS_PER_BATCH) {
    const batch = displaced.slice(start, start + ROWS_PER_BATCH);
    const marks = batch.map(() => '?').join(', ');
    const params = batch.map((row) => row.rowId);
    db.run(`UPDATE messages SET seq = seq + 1000000000 WHERE rowid IN (${marks})`, params);
  }

  for (let start = 0; start < displaced.length; start += ROWS_PER_BATCH) {
    const batch = displaced.slice(start, start + ROWS_PER_BATCH);
    const values = batch.map(() => '(?, ?)').join(', ');
    const params: (string | number | null)[] = [];
    for (const row of batch) {
      params.push(row.rowId, row.finalSeq);
    }
    db.run(
      `UPDATE messages SET seq = v.column2
       FROM (VALUES ${values}) AS v
       WHERE messages.rowid = v.column1`,
      params,
    );
  }
}

/**
 * Applies the planMerge inside the commit transaction (§9.2 step 10).
 *
 * @returns The counts for the import report.
 */
export function applyPlan(
  db: SqliteDatabase,
  input: Pick<ImportCommitInput, 'importId' | 'messages' | 'attachments'>,
  chatId: string,
  stored: readonly StoredEntry[],
): {
  readonly messagesInserted: number;
  readonly duplicatesSkipped: number;
  readonly mediaUpgraded: number;
} {
  const incomingByFingerprint = new Map<string, InsertableMessage>();
  for (const item of input.messages) {
    // First occurrence wins for identical fingerprints (occurrence is
    // already baked into the fingerprint itself at computation time).
    if (!incomingByFingerprint.has(item.fingerprint)) {
      incomingByFingerprint.set(item.fingerprint, item);
    }
  }

  const attachmentByFingerprint = new Map<string, InsertableAttachment>();
  for (const attachment of input.attachments) {
    if (!attachmentByFingerprint.has(attachment.fingerprintOfMessage)) {
      attachmentByFingerprint.set(attachment.fingerprintOfMessage, attachment);
    }
  }

  const ctx: ApplyContext = { db, chatId, importId: input.importId, attachmentByFingerprint };
  const { storedEntries, incomingEntries } = buildMergeInputs(
    stored,
    input,
    attachmentByFingerprint,
  );
  const plan = planMerge(storedEntries, incomingEntries);
  const { displaced, incomingFinals, mediaUpgraded } = collectPlanActions(ctx, plan, stored);

  // Displaced stored rows vacate their positions first, then incoming-only
  // rows insert at their final positions (no transient UNIQUE collisions).
  resequenceDisplacedRows(db, displaced);
  let messagesInserted = 0;
  for (const { merged, finalSeq } of incomingFinals) {
    applyIncomingRow(ctx, merged, finalSeq, incomingByFingerprint);
    messagesInserted += 1;
  }

  return {
    messagesInserted,
    duplicatesSkipped: input.messages.length - messagesInserted,
    mediaUpgraded,
  };
}
