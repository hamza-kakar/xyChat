/**
 * Property-based parser tests (AGENTS.md §19.2). fast-check runs each
 * property 1,000 times (300 for the heavier merge walk).
 */
import { createHash } from 'node:crypto';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { fingerprint } from '../fingerprint';
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

/** Fields for the header renderers. */
interface HeaderFields {
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly meridiem: 'AM' | 'PM';
  readonly author: string;
  readonly body: string;
}

/** Renders one iOS-style header line (12h with seconds, §24). */
function renderIosHeader(f: HeaderFields): string {
  const h12 = f.hour % 12 === 0 ? 12 : f.hour % 12;
  return `[${f.day}/11/2026, ${h12}:${String(f.minute).padStart(2, '0')}:00 ${f.meridiem}] ${f.author}: ${f.body}`;
}

/** Renders one Android-style header line (24h, dash separator, §24). */
function renderAndroidHeader(f: HeaderFields): string {
  return `${f.day}/11/2026, ${String(f.hour).padStart(2, '0')}:${String(f.minute).padStart(2, '0')} - ${f.author}: ${f.body}`;
}

interface GeneratedMessage {
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly meridiem: 'AM' | 'PM';
  readonly author: string;
  readonly body: string;
}

/** Canonical marker bodies the generator may emit, with the kind the
 * classifier must recover (§19.2.3 asserts kinds on generated data). */
function expectedKind(body: string): 'text' | 'deleted' | 'call' {
  if (body === 'This message was deleted.' || body === 'You deleted this message') {
    return 'deleted';
  }
  if (body === 'Missed voice call') {
    return 'call';
  }
  return 'text';
}

const arbitraryMessages: fc.Arbitrary<GeneratedMessage[]> = fc.array(
  fc.record({
    day: fc.constantFrom(16, 17, 18),
    hour: fc.integer({ min: 8, max: 22 }),
    minute: fc.integer({ min: 0, max: 59 }),
    meridiem: fc.constantFrom('AM', 'PM'),
    author: arbitraryAuthor,
    body: fc.oneof(
      arbitraryBodyLine,
      fc.constant('This message was deleted.'),
      fc.constant('Missed voice call'),
    ),
  }),
  { minLength: 1, maxLength: 10 },
);

/** A generated export: one platform per FILE (mixed headers would parse as
 * one dominant grammar with continuations, §8.5). */
interface GeneratedExport {
  readonly platform: 'ios' | 'android';
  readonly messages: readonly GeneratedMessage[];
}

const arbitraryExports: fc.Arbitrary<GeneratedExport> = fc.record({
  platform: fc.constantFrom('ios' as const, 'android' as const),
  messages: arbitraryMessages,
});

function renderAll(exported: GeneratedExport): string {
  const render = exported.platform === 'ios' ? renderIosHeader : renderAndroidHeader;
  return exported.messages
    .map((m) =>
      render({
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
  it('recovers authors, kinds, times and bodies exactly on both platforms', () => {
    const prop = fc.property(arbitraryExports, (exported) => {
      const text = renderAll(exported);
      const format = detectOrThrow(text);
      expect(format.platform).toBe(exported.platform);
      const parsed = parseChat(text, { format });
      if (!parsed.ok) {
        throw new Error('generation must parse');
      }
      expect(parsed.value.messages).toHaveLength(exported.messages.length);
      exported.messages.forEach((m, index) => {
        const parsedMessage = parsed.value.messages[index];
        expect(parsedMessage?.author).toBe(m.author);
        expect(parsedMessage?.kind).toBe(expectedKind(m.body));
        expect(parsedMessage?.body).toBe(m.body);
        expect(parsedMessage?.timestamp.day).toBe(m.day);
        const h24 =
          exported.platform === 'android'
            ? m.hour
            : (() => {
                const h12 = m.hour % 12 === 0 ? 12 : m.hour % 12;
                return m.meridiem === 'PM' ? (h12 === 12 ? 12 : h12 + 12) : h12 === 12 ? 0 : h12;
              })();
        expect(parsedMessage?.timestamp.hour).toBe(h24);
        expect(parsedMessage?.timestamp.minute).toBe(m.minute);
      });
    });
    expect(() => {
      fc.assert(prop, RUNS);
    }).not.toThrow();
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
    await fc.assert(prop, RUNS);
  });
});

describe('PARSER_VERSION', () => {
  it('is a semver string', () => {
    expect(PARSER_VERSION).toMatch(/^\d+\.\d+\.\d+$/u);
  });
});
