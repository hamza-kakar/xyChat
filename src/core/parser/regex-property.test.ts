/**
 * Property-based tokenizer tests (–). The tokenizer
 * never throws; leaf text equals the generated leaf fragments; and every
 * locale regex stays linear-time on adversarial inputs.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { en } from './locale/en';
import { astLeafText, parseText } from '../text-format';

const RUNS = { numRuns: 1000 };

/** Random safe leaf text, avoiding line-construct prefixes (>, -, 1.). */
const arbitraryLeaf = fc
  .stringMatching(/^[a-zA-Z0-9 ,.!?]{0,20}$/u)
  .filter((s) => !/^((\d{1,3}\.)|[-*•] |> )/u.test(s));

/** Inline spans built from known leaves plus valid markers. */
const arbitraryInline = fc.oneof(
  arbitraryLeaf,
  fc.tuple(arbitraryLeaf, arbitraryLeaf).map(([a, b]) => `*${a}${b}*`),
  fc.tuple(arbitraryLeaf, arbitraryLeaf).map(([a, b]) => `_${a}${b}_`),
  fc.tuple(arbitraryLeaf, arbitraryLeaf).map(([a, b]) => `~${a}${b}~`),
  fc.tuple(arbitraryLeaf, arbitraryLeaf).map(([a, b]) => `\`${a}${b}\``),
);

/** Bodies assembled from known leaves, inline spans and newlines. */
const arbitraryBody = fc
  .array(fc.oneof(arbitraryLeaf, arbitraryInline), { minLength: 0, maxLength: 6 })
  .map((parts) => parts.join('\n'));

describe('property: tokenizer never throws and leaves equal fragments', () => {
  it('holds on generated bodies', () => {
    const prop = fc.property(arbitraryBody, (body) => {
      const ast = parseText(body);
      // The AST must not throw and must be total; leaf text is defined by
      // construction here (generated bodies contain no stray markers), so
      // the strict-equality check applies to the marker-free subset.
      const leaf = astLeafText(ast);
      const withoutMarkers = body.replace(/(\*|_|~|`)/gu, '');
      expect(leaf.length).toBeLessThanOrEqual(withoutMarkers.length);
    });
    expect(() => {
      fc.assert(prop, RUNS);
    }).not.toThrow();
  });

  it('preserves exact leaves for constructed fragment bodies', () => {
    const prop = fc.property(fc.array(arbitraryLeaf, { minLength: 1, maxLength: 5 }), (leaves) => {
      const body = leaves.join('\n');
      expect(astLeafText(parseText(body))).toBe(body);
    });
    expect(() => {
      fc.assert(prop, RUNS);
    }).not.toThrow();
  });
});

describe('property: locale regexes stay fast', () => {
  it('processes adversarial 10k inputs under 50ms each', () => {
    const adversarial = [
      'a'.repeat(10_000),
      `${'a'.repeat(5_000)}${':' + 'a'.repeat(5_000)}`,
      `\u200E${'<attached: '.repeat(700)}`,
      `${'OPTION: '.repeat(1_200)}(1 vote)`,
      'location: '.repeat(900),
      `${'x '.repeat(5_000)}PM`,
    ];
    const regexes: readonly RegExp[] = [
      ...en.system,
      ...en.deleted,
      ...en.edited,
      ...en.omitted.map((o) => o.re),
      en.attachedIos,
      en.attachedAndroid,
      ...en.calls,
      en.pollOption,
    ];
    // JIT warmup: discard one pass so the measured steady state reflects the
    // regex cost, not the first-call compile (CI machines jitter).
    for (const input of adversarial) {
      for (const re of regexes) {
        re.test(input);
      }
    }
    // Median of 7 runs: a single call can absorb a GC pause or scheduler
    // hiccup under coverage instrumentation; the median reflects the regex's
    // actual cost, which is what budgets.
    const RUNS_PER_REGEX = 7;
    for (const input of adversarial) {
      for (const re of regexes) {
        const samples: number[] = [];
        for (let i = 0; i < RUNS_PER_REGEX; i += 1) {
          const start = performance.now();
          re.test(input);
          samples.push(performance.now() - start);
        }
        samples.sort((a, b) => a - b);
        const median = samples[Math.floor(RUNS_PER_REGEX / 2)] ?? Number.POSITIVE_INFINITY;
        expect(median).toBeLessThan(50);
      }
    }
  });
});
