import { describe, expect, it } from 'vitest';
import { planMerge, renumberSeq, type MergeEntry } from './merge';
import type { ParsedMessage } from './model';

/** Builds a message with the minimum fields merges care about. */
function msg(seq: number, body: string): ParsedMessage {
  return {
    seq,
    sourceLine: seq + 1,
    timestamp: { year: 2026, month: 11, day: 17, hour: 21, minute: seq, second: 0 },
    author: 'A',
    kind: 'text',
    body,
    isEdited: false,
    attachment: null,
    poll: null,
    location: null,
  };
}

/** Builds a merge entry from a message (fingerprint = body for tests). */
function entry(m: ParsedMessage, fingerprint: string, attachmentWasStored = true): MergeEntry {
  return {
    fingerprint,
    message: m,
    tsKey: m.timestamp.hour * 60 + m.timestamp.minute,
    attachmentWasStored,
  };
}

describe('planMerge', () => {
  it('is idempotent: re-importing the same file adds 0', () => {
    const list = [entry(msg(0, 'a'), 'f-a'), entry(msg(1, 'b'), 'f-b')];
    const plan = planMerge(list, [...list].reverse());
    expect(plan.counts.added).toBe(0);
    expect(plan.messages.map((m) => m.message.body)).toEqual(['a', 'b']);
    expect(plan.counts.duplicates).toBe(2);
  });

  it('adds only new messages from a superset export', () => {
    const stored = [entry(msg(0, 'a'), 'f-a'), entry(msg(1, 'c'), 'f-c')];
    const incoming = [
      entry(msg(0, 'a'), 'f-a'),
      entry(msg(1, 'b'), 'f-b'),
      entry(msg(2, 'c'), 'f-c'),
    ];
    const plan = planMerge(stored, incoming);
    expect(plan.counts.added).toBe(1);
    expect(plan.messages.map((m) => m.message.body)).toEqual(['a', 'b', 'c']);
    expect(plan.messages[1]?.fromIncoming).toBe(true);
  });

  it('preserves the relative order of each input', () => {
    const stored = [entry(msg(0, 'a'), 'f-a'), entry(msg(3, 'd'), 'f-d')];
    const incoming = [
      entry(msg(0, 'b'), 'f-b'),
      entry(msg(1, 'a2'), 'f-a2'),
      entry(msg(2, 'e'), 'f-e'),
    ];
    const plan = planMerge(stored, incoming);
    const bodies = plan.messages.map((m) => m.message.body);
    expect(bodies.filter((b) => ['a', 'd'].includes(b))).toEqual(['a', 'd']);
    expect(bodies.filter((b) => ['b', 'a2', 'e'].includes(b))).toEqual(['b', 'a2', 'e']);
  });
});

describe('planMerge media upgrades and ordering', () => {
  it('counts a media upgrade when the export newly supplies attachment bytes', () => {
    const stored = [
      entry(
        { ...msg(0, 'x'), attachment: { fileName: null, mediaType: 'image', status: 'omitted' } },
        'f-x',
        false,
      ),
    ];
    const incoming = [
      entry(
        {
          ...msg(0, 'x'),
          attachment: { fileName: 'IMG-1.jpg', mediaType: 'image', status: 'referenced' },
        },
        'f-x',
      ),
    ];
    const plan = planMerge(stored, incoming);
    expect(plan.counts.duplicates).toBe(1);
    expect(plan.counts.mediaUpgraded).toBe(1);
    expect(plan.counts.added).toBe(0);
  });

  it('orders unknown heads by timestamp with stored-first ties', () => {
    const early = { ...msg(0, 'early'), timestamp: { ...msg(0, 'early').timestamp, minute: 1 } };
    const late = { ...msg(0, 'late'), timestamp: { ...msg(0, 'late').timestamp, minute: 30 } };
    const stored = [entry(late, 'f-late')];
    const incoming = [entry(early, 'f-early')];
    const plan = planMerge(stored, incoming);
    expect(plan.messages.map((m) => m.message.body)).toEqual(['early', 'late']);
  });

  it('renumberSeq produces a gapless 0..n-1 sequence', () => {
    const stored = [entry(msg(0, 'a'), 'f-a')];
    const incoming = [entry(msg(0, 'b'), 'f-b')];
    const messages = renumberSeq(planMerge(stored, incoming));
    expect(messages.map((m) => m.seq)).toEqual([0, 1]);
  });

  it('handles empty inputs', () => {
    expect(planMerge([], []).counts).toEqual({ added: 0, duplicates: 0, mediaUpgraded: 0 });
    const onlyIncoming = planMerge([], [entry(msg(0, 'a'), 'f-a')]);
    expect(onlyIncoming.counts.added).toBe(1);
    const onlyStored = planMerge([entry(msg(0, 'a'), 'f-a')], []);
    expect(onlyStored.counts.added).toBe(0);
    expect(onlyStored.messages).toHaveLength(1);
  });
});
