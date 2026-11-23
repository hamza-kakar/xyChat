/**
 * Import run phase tests: parsing with progress,
 *  fingerprints with occurrence counting, cancellation, and warning
 * grouping — against the real parser with an injected hash.
 */
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { runImportParse, type RunProgress } from './import-run';
import { detectFormat, type DetectedFormat } from '../core/parser';
import type { HashBytes } from '../core/fingerprint';

const hashBytes: HashBytes = (bytes) =>
  Promise.resolve(new Uint8Array(createHash('sha256').update(bytes).digest()));

const IOS_TEXT = [
  'orphan banner line',
  '[17/11/2026, 9:19:00 PM] Sara: first message',
  '[17/11/2026, 9:19:30 PM] Sara: first message',
  '[17/11/2026, 9:20:00 PM] Ali: ‎<attached: IMG-0001.jpg>',
  '[17/11/2026, 9:21:00 PM] Sara: done',
].join('\n');

function detectOrThrow(text: string): DetectedFormat {
  const detected = detectFormat(text);
  if (!detected.ok) {
    throw new Error(`fixture must be detectable: ${detected.error.code}`);
  }
  return detected.value;
}

/** Builds a synthetic export of `count` iOS-format messages. */
function bigText(count: number): string {
  const lines: string[] = ['banner'];
  for (let i = 0; i < count; i += 1) {
    const minute = i % 12 === 0 ? 12 : i % 12;
    lines.push(
      `[17/11/2026, ${minute}:${String(i % 60).padStart(2, '0')}:00 PM] Author${i % 7}: body ${i}`,
    );
  }
  return lines.join('\n');
}

/** Runs the parse with quiet hooks. */
async function quietRun(text: string): Promise<Awaited<ReturnType<typeof runImportParse>>> {
  return runImportParse(text, detectOrThrow(text), hashBytes, {
    onProgress: () => undefined,
    isCancelled: () => false,
  });
}

describe('runImportParse', () => {
  it('fingerprints identical texts with distinct occurrences', async () => {
    const result = await quietRun(IOS_TEXT);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.messages).toHaveLength(4);
    const [first, duplicate] = result.value.messages;
    // The two identical Sara messages differ only by timestamp, so they have
    // different fingerprints; occurrence counters stay per-tuple.
    expect(first?.fingerprint).not.toBe(duplicate?.fingerprint);
    expect(first?.fingerprint).toMatch(/^[0-9a-f]{32}$/u);
    expect(result.value.messages[2]?.message.attachment?.fileName).toBe('IMG-0001.jpg');
  });

  it('groups parse warnings by code', async () => {
    const result = await quietRun(IOS_TEXT);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.warningsByCode).toEqual({ ORPHAN_LINES_BEFORE_FIRST_MESSAGE: 1 });
    expect(result.value.stats.messages).toBe(4);
  });

  it('reports parsing and fingerprinting progress', async () => {
    // > 5,000 lines so the progress throttle fires.
    const progress: RunProgress[] = [];
    const result = await runImportParse(bigText(6_000), detectOrThrow(bigText(6_000)), hashBytes, {
      onProgress: (event) => {
        progress.push(event);
      },
      isCancelled: () => false,
    });
    expect(result.ok).toBe(true);
    const phases = new Set(progress.map((event) => event.phase));
    expect(phases.has('parsing')).toBe(true);
    expect(phases.has('fingerprinting')).toBe(true);
    const parsing = progress.filter((event) => event.phase === 'parsing');
    expect(parsing[0]?.current).toBeGreaterThanOrEqual(5_000);
    if (!result.ok) {
      return;
    }
    expect(result.value.messages).toHaveLength(6_000);
  });

  it('cancels during parsing with CANCELLED', async () => {
    const text = bigText(20_000);
    let calls = 0;
    const result = await runImportParse(text, detectOrThrow(text), hashBytes, {
      onProgress: () => undefined,
      isCancelled: () => {
        calls += 1;
        return calls >= 1;
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('CANCELLED');
    }
  });

  it('counts replacement characters in the decoded text', async () => {
    const result = await quietRun(`${IOS_TEXT}\uFFFD`);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.replacementChars).toBe(1);
    }
  });
});
