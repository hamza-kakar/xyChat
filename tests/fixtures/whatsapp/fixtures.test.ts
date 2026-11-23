/**
 * Golden fixture runner. For every variant under
 * `whatsapp/`, parses `chat.txt` through the public API and requires the
 * result to deep-equal the committed `expected.json`. `expected.json` files
 * are reviewed outputs — regenerate only via `pnpm fixtures:update`.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { detectFormat, parseChat, type DetectedFormat } from '../../../src/core/parser';

const fixturesRoot = __dirname;

interface ExpectedFixture {
  readonly format: DetectedFormat;
  readonly messages: unknown[];
  readonly participants: readonly string[];
  readonly warnings: unknown[];
  readonly stats: {
    readonly lines: number;
    readonly messages: number;
    readonly system: number;
    readonly media: number;
  };
  readonly parserVersion: string;
}

const variantDirs = readdirSync(fixturesRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

describe.each(variantDirs)('fixture %s', (variant) => {
  const dir = resolve(fixturesRoot, variant);
  const chatText = readFileSync(resolve(dir, 'chat.txt'), 'utf8');
  const expected = JSON.parse(
    readFileSync(resolve(dir, 'expected.json'), 'utf8'),
  ) as ExpectedFixture;

  it('detects the declared format', () => {
    const detected = detectFormat(chatText);
    expect(detected.ok).toBe(true);
    if (detected.ok) {
      expect(detected.value).toEqual(expected.format);
    }
  });

  it('parses exactly the committed expectation', () => {
    const parsed = parseChat(chatText, { format: expected.format });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value.messages).toEqual(expected.messages);
      expect(parsed.value.participants).toEqual(expected.participants);
      expect(parsed.value.warnings).toEqual(expected.warnings);
      expect(parsed.value.stats).toEqual(expected.stats);
      expect(parsed.value.parserVersion).toBe(expected.parserVersion);
    }
  });
});
