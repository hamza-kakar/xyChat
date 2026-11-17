/**
 * Merge planning for re-imports (AGENTS.md §8.10). Two ordered message
 * lists — the stored chat and a newly parsed export — are walked like a
 * merge join on fingerprints: duplicates collapse, both inputs keep their
 * relative order, nothing is lost. The plan is pure and idempotent:
 * importing the same file twice adds 0.
 */
import type { ParsedMessage } from './model';

/** One message in the merge output, tagged with its origin. */
export interface MergedMessage {
  readonly message: ParsedMessage;
  /** True when this entry came from the incoming export. */
  readonly fromIncoming: boolean;
}

/** Aggregate counts reported to the import report (§9.2 step 11). */
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
  /** True when the stored entry already has its media bytes stored. */
  readonly attachmentWasStored: boolean;
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
function emitExisting(plan: MergePlanBuilder, entry: MergeEntry): void {
  plan.messages.push({ message: entry.message, fromIncoming: false });
  plan.emitted.add(entry.fingerprint);
}

/**
 * Decides whether the existing head comes before the incoming head (§8.10
 * rule 2, in the spec's order): an incoming head that exists anywhere in the
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
 * Walks both lists and emits the final order (§8.10 rules 1–3).
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
        plan.messages.push({ message: incomingEntry.message, fromIncoming: true });
        plan.added += 1;
        plan.emitted.add(incomingEntry.fingerprint);
      }
      j += 1;
      continue;
    }

    if (existingEntry.fingerprint === incomingEntry.fingerprint) {
      // Rule 1: emit once from the stored side, advance BOTH; media that the
      // export newly provides upgrades a stored omitted/missing attachment.
      emitExisting(plan, existingEntry);
      plan.duplicates += 1;
      if (!existingEntry.attachmentWasStored && incomingEntry.message.attachment !== null) {
        plan.mediaUpgraded += 1;
      }
      i += 1;
      j += 1;
      continue;
    }

    if (existingHeadFirst(existingEntry, incomingEntry, incomingByFingerprint, plan)) {
      emitExisting(plan, existingEntry);
      i += 1;
    } else {
      plan.messages.push({ message: incomingEntry.message, fromIncoming: true });
      plan.added += 1;
      plan.emitted.add(incomingEntry.fingerprint);
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
