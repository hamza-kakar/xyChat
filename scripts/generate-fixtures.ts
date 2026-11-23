/**
 * Synthetic export fixture generator. Each variant in
 * `fixture-variants.ts` is a typed description of an export shape; running
 * this script renders the input text, runs the real parser, and writes
 * `tests/fixtures/whatsapp/<variant>/{chat.txt, expected.json, README.md}`.
 *
 * `expected.json` is committed and reviewed; it is NEVER regenerated in CI.
 * Run `pnpm fixtures:gen` to (re)create files; `pnpm fixtures:update` to
 * refresh expected outputs deliberately, and call the diff out in the PR.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectFormat, parseChat, PARSER_VERSION, type DetectedFormat } from '../src/core/parser';
import { VARIANTS_PART1, type VariantSpec } from './fixture-variants';
import { VARIANTS_PART2 } from './fixture-variants-more';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixturesRoot = resolve(projectRoot, 'tests/fixtures/whatsapp');

/** Applies the variant's line endings and BOM to the rendered lines. */
function renderText(variant: VariantSpec): string {
  const joined = variant.lines.join('\n');
  const withEndings = variant.crlf === true ? joined.replace(/\n/g, '\r\n') : joined;
  return variant.bom === true ? `\uFEFF${withEndings}` : withEndings;
}

/** Writes one fixture directory (input, expected output, readme). */
function writeFixture(variant: VariantSpec): void {
  const text = renderText(variant);
  const detected = detectFormat(
    text,
    variant.localeHint === undefined ? {} : { localeHint: variant.localeHint },
  );
  if (!detected.ok) {
    throw new Error(`variant ${variant.id}: detection failed (${detected.error.code})`);
  }

  const detectedValue = detected.value;
  const mismatches: string[] = [];
  if (detectedValue.platform !== variant.expectedPlatform) mismatches.push('platform');
  if (detectedValue.headerPatternId !== variant.expectedPatternId)
    mismatches.push('headerPatternId');
  if (detectedValue.dateOrder !== variant.expectedOrder) mismatches.push('dateOrder');
  if (detectedValue.dateOrderSource !== variant.expectedOrderSource)
    mismatches.push('dateOrderSource');
  if (detectedValue.clock !== variant.expectedClock) mismatches.push('clock');
  if (detectedValue.hasSeconds !== variant.expectedSeconds) mismatches.push('hasSeconds');
  if (mismatches.length > 0) {
    throw new Error(
      `variant ${variant.id}: declared expectations disagree with detection: ${mismatches.join(', ')}`,
    );
  }
  const format: DetectedFormat = {
    platform: variant.expectedPlatform,
    headerPatternId: variant.expectedPatternId,
    dateOrder: variant.expectedOrder,
    dateOrderSource: variant.expectedOrderSource,
    clock: variant.expectedClock,
    hasSeconds: variant.expectedSeconds,
    confidence: detectedValue.confidence,
    sampleMessages: detectedValue.sampleMessages,
  };

  const parsed = parseChat(text, { format });
  if (!parsed.ok) {
    throw new Error(`variant ${variant.id}: parse failed`);
  }
  const expected = {
    format,
    messages: parsed.value.messages,
    participants: parsed.value.participants,
    warnings: parsed.value.warnings,
    stats: parsed.value.stats,
    parserVersion: PARSER_VERSION,
  };

  const dir = resolve(fixturesRoot, variant.id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, 'chat.txt'), text, 'utf8');
  writeFileSync(resolve(dir, 'expected.json'), `${JSON.stringify(expected, null, 2)}\n`, 'utf8');
  writeFileSync(resolve(dir, 'README.md'), `# ${variant.id}\n\n${variant.description}\n`, 'utf8');
  console.log(`wrote ${variant.id} (${expected.messages.length} messages)`);
}

const VARIANTS = [...VARIANTS_PART1, ...VARIANTS_PART2];

for (const variant of VARIANTS) {
  writeFixture(variant);
}
console.log(`done: ${VARIANTS.length} fixtures in ${fixturesRoot}`);
