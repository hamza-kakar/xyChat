/**
 * Property-based parser tests (AGENTS.md §19.2). fast-check runs each
 * property 1,000 times (300 for the heavier merge walk).
 */
import { createHash } from 'node:crypto';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { fingerprint } from '../fingerprint';
import { planMerge, type MergeEntry } from '../merge';
import type { ParsedMessage } from '../model';
import { detectFormat, parseChat, PARSER_VERSION, type DetectedFormat } from './index';

const RUNS = { numRuns: 1000 };

/** Arbitrary single-line body: whitespace-stable (§8.3.5 trims trailing),
 * without author-splitting `: `, and not header-shaped (lines starting with
 * a digit or bracket-digit are header-like per §8.4 step 2, so generated
 * continuations avoid them — tiny files full of header-like junk are
 * conservatively UNRECOGNIZED per spec). */
const arbitraryBodyLine = fc
  .stringMatching(/^[^\n]{1,40}$/u)
  .filter((s) => !s.includes(': ') && s.trim() === s && s.trim().length > 0 && !/^[0-9[]/u.test(s));

/**
 * Bodies that COLLIDE with the §8.6 marker vocabulary (system keywords,
 * deleted, calls). Round-trip and line-accounting generators include these
 * on purpose: authored messages containing marker text must stay authored
 * text (regression coverage for the actor-pattern tightening).
 */
const arbitraryMarkerishBody = fc.constantFrom(
  'I added sugar to the tea',
  'ok we left',
  'Bob removed the stain',
  'Disappearing messages are cool',
  'I joined the group yesterday',
  'This message was deleted.',
  'Missed voice call',
  'You deleted this message',
  'Tap to learn more about it',
);

/** Arbitrary author name (letters, digits, spaces, dots). */
const arbitraryAuthor = fc
  .stringMatching(/^[A-Za-z][A-Za-z .]{0,14}$/u)
  .filter((s) => s.trim().length > 0);

/** Fields for the iOS header renderer. */
interface HeaderFields {
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly meridiem: 'AM' | 'PM';
  readonly author: string;
  readonly body: string;
}

/** Renders one iOS-style header line for given fields. */
function renderIosHeader(f: HeaderFields): string {
  const h12 = f.hour % 12 === 0 ? 12 : f.hour % 12;
  return `[${f.day}/11/2026, ${h12}:${String(f.minute).padStart(2, '0')}:00 ${f.meridiem}] ${f.author}: ${f.body}`;
}

interface GeneratedMessage {
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly meridiem: 'AM' | 'PM';
  readonly author: string;
  readonly body: string;
}

const arbitraryMessages: fc.Arbitrary<GeneratedMessage[]> = fc.array(
  fc.record({
    day: fc.constantFrom(16, 17, 18),
    hour: fc.integer({ min: 8, max: 22 }),
    minute: fc.integer({ min: 0, max: 59 }),
    meridiem: fc.constantFrom('AM', 'PM'),
    author: arbitraryAuthor,
    body: fc.oneof(arbitraryBodyLine, arbitraryMarkerishBody),
  }),
  { minLength: 1, maxLength: 10 },
);

function renderAll(messages: readonly GeneratedMessage[]): string {
  return messages
    .map((m) =>
      renderIosHeader({
        day: m.day,
        hour: m.hour,
        minute: m.minute,
        meridiem: m.meridiem,
        author: m.author,
        body: m.body,
      }),
    )
    .join('\n');
}

/** Detects and unwraps; throws on generation mistakes, not parser errors. */
function detectOrThrow(text: string): DetectedFormat {
  const detected = detectFormat(text);
  if (!detected.ok) {
    throw new Error(`generation must be detectable: ${detected.error.code}`);
  }
  return detected.value;
}

describe('property: parseChat never throws (§19.2.1)', () => {
  it('survives arbitrary strings', () => {
    const prop = fc.property(fc.string({ maxLength: 2000 }), (input) => {
      const detected = detectFormat(input);
      if (detected.ok) {
        parseChat(input, { format: detected.value });
      }
    });
    expect(() => {
      fc.assert(prop, RUNS);
    }).not.toThrow();
  });
});

describe('property: line accounting (§19.2.2)', () => {
  it('accounts every non-empty line in a body, header or warning', () => {
    const prop = fc.property(
      fc.array(
        fc.record({
          day: fc.constantFrom(16, 17, 18),
          hour: fc.integer({ min: 8, max: 22 }),
          minute: fc.integer({ min: 0, max: 59 }),
          meridiem: fc.constantFrom('AM', 'PM'),
          author: arbitraryAuthor,
          bodyLines: fc.array(fc.oneof(arbitraryBodyLine, arbitraryMarkerishBody), {
            minLength: 1,
            maxLength: 3,
          }),
        }),
        { minLength: 1, maxLength: 8 },
      ),
      (messages) => {
        const lines: string[] = [];
        for (const m of messages) {
          lines.push(
            renderIosHeader({
              day: m.day,
              hour: m.hour,
              minute: m.minute,
              meridiem: m.meridiem,
              author: m.author,
              body: m.bodyLines[0] ?? '',
            }),
          );
          for (const extra of m.bodyLines.slice(1)) {
            lines.push(extra);
          }
        }
        const text = lines.join('\n');
        const format = detectOrThrow(text);
        const parsed = parseChat(text, { format });
        if (!parsed.ok) {
          throw new Error('generation must parse');
        }
        // §8.5: non-header lines are continuations, so every non-empty
        // non-header input line must appear in some message body. Header
        // lines are consumed by the grammar (their REST is a body line).
        const bodyLines = parsed.value.messages.map((m) => m.body.split('\n')).flat();
        const accounted = new Set(bodyLines);
        const continuations = lines.filter((l) => l.trim() !== '' && !l.includes(': '));
        expect(continuations.every((line) => accounted.has(line))).toBe(true);
      },
    );
    expect(() => {
      fc.assert(prop, RUNS);
    }).not.toThrow();
  });
});

describe('property: generated exports round-trip (§19.2.3)', () => {
  it('recovers authors, times and bodies exactly', () => {
    const prop = fc.property(arbitraryMessages, (messages) => {
      const text = renderAll(messages);
      const format = detectOrThrow(text);
      const parsed = parseChat(text, { format });
      if (!parsed.ok) {
        throw new Error('generation must parse');
      }
      expect(parsed.value.messages).toHaveLength(messages.length);
      messages.forEach((m, index) => {
        const parsedMessage = parsed.value.messages[index];
        expect(parsedMessage?.author).toBe(m.author);
        expect(parsedMessage?.body).toBe(m.body);
        expect(parsedMessage?.timestamp.day).toBe(m.day);
        const h12 = m.hour % 12 === 0 ? 12 : m.hour % 12;
        const h24 = m.meridiem === 'PM' ? (h12 === 12 ? 12 : h12 + 12) : h12 === 12 ? 0 : h12;
        expect(parsedMessage?.timestamp.hour).toBe(h24);
        expect(parsedMessage?.timestamp.minute).toBe(m.minute);
      });
    });
    expect(() => {
      fc.assert(prop, RUNS);
    }).not.toThrow();
  });
});

const MERGE_RUNS = { numRuns: 1000 };

/** Builds an entry; bodies are unique per list, so fp = body. */
function mergeEntry(body: string, index: number): MergeEntry {
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
  return { fingerprint: body, message, tsKey: index, attachmentWasStored: true };
}

describe('property: merge idempotent, order-preserving, lossless (§19.2.5)', () => {
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
        // A body present in BOTH lists is emitted from the stored side
        // (§8.10 rule 1), so the incoming-side stream must match exactly the
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
          attachmentWasStored: true,
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

describe('property: fingerprints deterministic and distinct (§19.2.4)', () => {
  it('holds on generated tuples', async () => {
    const prop = fc.asyncProperty(
      fc.record({
        a: arbitraryAuthor,
        b: arbitraryAuthor,
        minuteA: fc.integer({ min: 0, max: 59 }),
        minuteB: fc.integer({ min: 0, max: 59 }),
        bodyA: arbitraryBodyLine.filter((s) => s !== ''),
        bodyB: arbitraryBodyLine.filter((s) => s !== ''),
      }),
      async (choice) => {
        const hash = (bytes: Uint8Array): Promise<Uint8Array> =>
          Promise.resolve(new Uint8Array(createHash('sha256').update(bytes).digest()));
        const fp1 = await fingerprint(
          {
            tsCanonical: `2026-11-17T21:${String(choice.minuteA).padStart(2, '0')}:00`,
            author: choice.a,
            kind: 'text',
            body: choice.bodyA,
            attachmentFileName: '',
            occurrence: 0,
          },
          hash,
        );
        const fp2 = await fingerprint(
          {
            tsCanonical: `2026-11-17T21:${String(choice.minuteB).padStart(2, '0')}:00`,
            author: choice.b,
            kind: 'text',
            body: choice.bodyB,
            attachmentFileName: '',
            occurrence: 0,
          },
          hash,
        );
        const identical =
          choice.a === choice.b &&
          choice.minuteA === choice.minuteB &&
          choice.bodyA === choice.bodyB;
        if (identical) {
          expect(fp1).toBe(fp2);
        } else {
          expect(fp1).not.toBe(fp2);
        }
      },
    );
    await fc.assert(prop, MERGE_RUNS);
  });
});

describe('PARSER_VERSION', () => {
  it('is a semver string', () => {
    expect(PARSER_VERSION).toMatch(/^\d+\.\d+\.\d+$/u);
  });
});
