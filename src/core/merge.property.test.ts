/**
 * Property-based merge tests: planMerge is
 * idempotent, preserves each input's relative order, never loses a message,
 * and counts media upgrades only for twins whose export newly provides
 * bytes. fast-check runs each property 1,000 times.
 */
import fc from 'fast-check';
import { describe, it } from 'vitest';
import { planMerge, type MergeEntry } from './merge';
import type { ParsedMessage } from './model';

const MERGE_RUNS = { numRuns: 1000 };

/** Builds an entry; bodies are unique per list, so fp = body. */
function mergeEntry(body: string, index: number, attachmentStored = true): MergeEntry {
  const message: ParsedMessage = {
    seq: index,
    sourceLine: index + 1,
    timestamp: { year: 2026, month: 11, day: 17, hour: 21, minute: index % 60, second: 0 },
    author: 'A',
    kind: 'text',
    body,
    isEdited: false,
    attachment: null,
    poll: null,
    location: null,
  };
  // Content-derived fingerprint, mirroring real occurrence-counted ids.
  return { fingerprint: body, message, tsKey: index, attachmentStored };
}

describe('property: merge idempotent, order-preserving, lossless', () => {
  it('holds on generated lists', () => {
    const prop = fc.property(
      fc
        .array(fc.stringMatching(/^[a-z]{3,6}$/u), { minLength: 0, maxLength: 10 })
        .map((a) => [...new Set(a)]),
      fc
        .array(fc.stringMatching(/^[a-z]{3,6}$/u), { minLength: 0, maxLength: 10 })
        .map((a) => [...new Set(a)]),
      fc.boolean(),
      (existingBodies, incomingBodies, shuffleIncoming) => {
        const existing = existingBodies.map((b, index) => mergeEntry(b, index));
        const incomingBodiesMaybeReversed = shuffleIncoming
          ? [...incomingBodies].reverse()
          : incomingBodies;
        const incoming = incomingBodiesMaybeReversed.map((b, index) => mergeEntry(b, index));
        const plan = planMerge(existing, incoming);

        const bodies = plan.messages.map((m) => m.message.body);
        // Lossless + deduplicated: each fingerprint appears at most once in
        // the output (fingerprints are unique per entry, mirroring the
        // occurrence counter); bodies themselves may legitimately repeat.
        const fps = plan.messages.map((m) => m.fingerprint);
        if (new Set(fps).size !== fps.length) {
          throw new Error(`fps dup: ${JSON.stringify(fps)}`);
        }
        const outputSet = new Set(bodies);
        for (const body of new Set(existingBodies)) {
          if (!outputSet.has(body)) {
            throw new Error(`existing body missing from output: ${body}`);
          }
        }
        // Per-input relative order preserved.
        const existingOrder = plan.messages
          .filter((m) => !m.fromIncoming)
          .map((m) => m.message.body)
          .filter((b) => existingBodies.includes(b));
        if (JSON.stringify(existingOrder) !== JSON.stringify(existingBodies)) {
          throw new Error(
            `existingOrder ${JSON.stringify(existingOrder)} vs ${JSON.stringify(existingBodies)}`,
          );
        }
        // Order preservation is per INPUT list — after the optional shuffle.
        // A body present in BOTH lists is emitted from the stored side, so the incoming-side stream must match exactly the
        // incoming bodies that were not already stored.
        const incomingOrder = plan.messages
          .filter((m) => m.fromIncoming)
          .map((m) => m.message.body);
        const storedSet = new Set(existingBodies);
        const expectedIncoming = incomingBodiesMaybeReversed.filter((b) => !storedSet.has(b));
        if (JSON.stringify(incomingOrder) !== JSON.stringify(expectedIncoming)) {
          throw new Error(
            `incomingOrder ${JSON.stringify(incomingOrder)} vs ${JSON.stringify(expectedIncoming)}`,
          );
        }

        // Idempotency: re-merging with the same incoming list adds 0.
        const mergedEntries: MergeEntry[] = plan.messages.map((m, index) => ({
          fingerprint: m.fingerprint,
          message: { ...m.message, seq: index },
          tsKey: m.message.timestamp.minute,
          attachmentStored: true,
        }));
        const again = planMerge(mergedEntries, incoming);
        if (again.counts.added !== 0) {
          throw new Error(`idempotency added=${again.counts.added} plan=${JSON.stringify(bodies)}`);
        }
      },
    );
    fc.assert(prop, MERGE_RUNS);
  });
});

describe('property: media upgrades count only newly present media', () => {
  it('an omitted twin never upgrades (mediaUpgraded stays 0)', () => {
    const prop = fc.property(
      fc
        .array(fc.stringMatching(/^[a-z]{3,6}$/u), { minLength: 0, maxLength: 10 })
        .map((a) => [...new Set(a)]),
      fc
        .array(fc.stringMatching(/^[a-z]{3,6}$/u), { minLength: 0, maxLength: 10 })
        .map((a) => [...new Set(a)]),
      fc.boolean(),
      fc.boolean(),
      (existingBodies, incomingBodies, shuffleIncoming, storedHasMedia) => {
        const existing = existingBodies.map((b, index) => mergeEntry(b, index, storedHasMedia));
        // Re-import WITHOUT media: every incoming twin is an omitted
        // placeholder ('omitted') — nothing can be upgraded.
        const incomingBodiesMaybeReversed = shuffleIncoming
          ? [...incomingBodies].reverse()
          : incomingBodies;
        const incoming = incomingBodiesMaybeReversed.map((b, index) => mergeEntry(b, index, false));
        const plan = planMerge(existing, incoming);
        if (plan.counts.mediaUpgraded !== 0) {
          throw new Error(`omitted twins upgraded ${plan.counts.mediaUpgraded} messages`);
        }
      },
    );
    fc.assert(prop, MERGE_RUNS);
  });

  it('mediaUpgraded equals the twins whose export newly provides bytes', () => {
    const prop = fc.property(
      fc
        .array(fc.stringMatching(/^[a-z]{3,6}$/u), { minLength: 0, maxLength: 8 })
        .map((a) => [...new Set(a)]),
      fc
        .array(fc.stringMatching(/^[a-z]{3,6}$/u), { minLength: 0, maxLength: 8 })
        .map((a) => [...new Set(a)]),
      fc.array(fc.boolean(), { minLength: 0, maxLength: 8 }),
      fc.array(fc.boolean(), { minLength: 0, maxLength: 8 }),
      (existingBodies, incomingBodies, storedFlags, incomingFlags) => {
        const existing = existingBodies.map((b, index) =>
          mergeEntry(b, index, storedFlags[index] ?? false),
        );
        const incoming = incomingBodies.map((b, index) =>
          mergeEntry(b, index, incomingFlags[index] ?? false),
        );
        const plan = planMerge(existing, incoming);
        // Expected: rule-1 twins (fingerprints in BOTH lists) whose stored
        // entry lacks bytes and whose export provides them.
        const storedFlagsByFp = new Map(
          existing.map((entry) => [entry.fingerprint, entry.attachmentStored]),
        );
        const incomingFlagsByFp = new Map(
          incoming.map((entry) => [entry.fingerprint, entry.attachmentStored]),
        );
        const expected = existingBodies.filter(
          (b) => incomingFlagsByFp.get(b) === true && storedFlagsByFp.get(b) === false,
        ).length;
        if (plan.counts.mediaUpgraded !== expected) {
          throw new Error(`mediaUpgraded=${plan.counts.mediaUpgraded} expected=${expected}`);
        }
      },
    );
    fc.assert(prop, MERGE_RUNS);
  });
});
