/**
 * Merge planning for re-imports. Two ordered message
 * lists — the stored chat and a newly parsed export — are walked like a
 * merge join on fingerprints: duplicates collapse, both inputs keep their
 * relative order, nothing is lost. The plan is pure and idempotent:
 * importing the same file twice adds 0.
 */
import type { ParsedMessage } from './model';

/** One message in the merge output, tagged with its origin. */
export interface MergedMessage {
  /** The entry's fingerprint, carried so re-merges stay aligned. */
  readonly fingerprint: string;
  readonly message: ParsedMessage;
  /** True when this entry came from the incoming export. */
  readonly fromIncoming: boolean;
  /**
   * When a stored entry merged with an identical incoming twin, this is the twin's fingerprint — the caller uses it to apply
   * upgrades (e.g. media bytes the export newly provides). Null otherwise.
   */
  readonly fingerprintOfIncomingTwin: string | null;
}

/** Aggregate counts reported to the import report. */
export interface MergeCounts {
  readonly added: number;
  readonly duplicates: number;
  readonly mediaUpgraded: number;
}

/** A completed merge plan: the final ordered list plus counts. */
export interface MergePlan {
  readonly messages: readonly MergedMessage[];
  readonly counts: MergeCounts;
}

/** The identity used to align the two lists (precomputed fingerprints). */
export interface MergeEntry {
  readonly fingerprint: string;
  readonly message: ParsedMessage;
  /** Timestamp key for tie-breaking (wall-clock as UTC seconds). */
  readonly tsKey: number;
  /**
   * True when the entry carries its media bytes: for a stored entry, the
   * bytes are already in OPFS; for an incoming entry, the file is present
   * in the export (that will be written).
   */
  readonly attachmentStored: boolean;
}

/** Mutable walk state, local to one planMerge run. */
interface MergePlanBuilder {
  readonly messages: MergedMessage[];
  added: number;
  duplicates: number;
  mediaUpgraded: number;
  /** Fingerprints already present in the output (dedupe of leftovers). */
  readonly emitted: Set<string>;
  /** Fingerprints the stored chat knows (membership for rule 2). */
  readonly existingByFingerprint: Set<string>;
}

/** Emits a stored entry in the output, marking its fingerprint as present. */
function emitExisting(
  plan: MergePlanBuilder,
  entry: MergeEntry,
  twinFingerprint: string | null = null,
): void {
  plan.messages.push({
    fingerprint: entry.fingerprint,
    message: entry.message,
    fromIncoming: false,
    fingerprintOfIncomingTwin: twinFingerprint,
  });
  plan.emitted.add(entry.fingerprint);
}

/** Emits an incoming-only entry as newly added. */
function emitNewIncoming(plan: MergePlanBuilder, entry: MergeEntry): void {
  plan.messages.push({
    fingerprint: entry.fingerprint,
    message: entry.message,
    fromIncoming: true,
    fingerprintOfIncomingTwin: null,
  });
  plan.added += 1;
  plan.emitted.add(entry.fingerprint);
}

/**
 * Decides whether the existing head comes before the incoming head (in the spec's order): an incoming head that exists anywhere in the
 * stored list emits the stored head first; an existing head that exists
 * anywhere in the export emits the incoming head first. Unknown heads
 * interleave by timestamp, ties stored-first (rule 3).
 */
function existingHeadFirst(
  existingEntry: MergeEntry,
  incomingEntry: MergeEntry,
  incomingByFingerprint: ReadonlySet<string>,
  plan: MergePlanBuilder,
): boolean {
  if (plan.existingByFingerprint.has(incomingEntry.fingerprint)) {
    return true;
  }
  if (incomingByFingerprint.has(existingEntry.fingerprint)) {
    return false;
  }
  if (existingEntry.tsKey !== incomingEntry.tsKey) {
    return existingEntry.tsKey < incomingEntry.tsKey;
  }
  return true;
}

/**
 * Walks both lists and emits the final order.
 *
 * @param existing Stored messages, in stored (seq) order.
 * @param incoming Newly parsed messages, in file order.
 */
export function planMerge(
  existing: readonly MergeEntry[],
  incoming: readonly MergeEntry[],
): MergePlan {
  const incomingByFingerprint = new Set<string>(incoming.map((entry) => entry.fingerprint));

  const plan: MergePlanBuilder = {
    messages: [],
    added: 0,
    duplicates: 0,
    mediaUpgraded: 0,
    emitted: new Set<string>(),
    existingByFingerprint: new Set<string>(existing.map((entry) => entry.fingerprint)),
  };
  let i = 0;
  let j = 0;

  while (i < existing.length || j < incoming.length) {
    const existingEntry = existing[i];
    const incomingEntry = incoming[j];

    if (incomingEntry === undefined) {
      if (existingEntry !== undefined) {
        emitExisting(plan, existingEntry);
      }
      i += 1;
      continue;
    }
    if (existingEntry === undefined) {
      // Stored side exhausted: an incoming message already emitted in this
      // walk is a duplicate; one that was never stored is new.
      if (plan.emitted.has(incomingEntry.fingerprint)) {
        plan.duplicates += 1;
      } else {
        emitNewIncoming(plan, incomingEntry);
      }
      j += 1;
      continue;
    }

    if (existingEntry.fingerprint === incomingEntry.fingerprint) {
      // Rule 1: emit once from the stored side, advance BOTH. Media counts
      // as upgraded only when the export NEWLY provides bytes: the
      // stored entry has none and the incoming twin has them. An omitted
      // twin never turns a placeholder into present media.
      plan.duplicates += 1;
      if (!existingEntry.attachmentStored && incomingEntry.attachmentStored) {
        plan.mediaUpgraded += 1;
      }
      emitExisting(plan, existingEntry, incomingEntry.fingerprint);
      i += 1;
      j += 1;
      continue;
    }

    if (existingHeadFirst(existingEntry, incomingEntry, incomingByFingerprint, plan)) {
      emitExisting(plan, existingEntry);
      i += 1;
    } else {
      emitNewIncoming(plan, incomingEntry);
      j += 1;
    }
  }

  return {
    messages: plan.messages,
    counts: { added: plan.added, duplicates: plan.duplicates, mediaUpgraded: plan.mediaUpgraded },
  };
}

/** Renumbers `seq` 0..n-1 over a merge plan's messages. */
export function renumberSeq(plan: MergePlan): readonly ParsedMessage[] {
  return plan.messages.map((merged, index) => ({
    ...merged.message,
    seq: index,
  }));
}
