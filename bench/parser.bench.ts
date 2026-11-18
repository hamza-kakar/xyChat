/**
 * Parser benchmarks (AGENTS.md §17). Run with `pnpm bench`. The budget
 * assertion itself lives in parser-perf.test.ts; this file tracks detailed
 * timings for tuning.
 */
import { bench, describe } from 'vitest';
import { detectFormat, parseChat } from '../src/core/parser';

function buildLargeExport(messageCount: number): string {
  const authors = ['Ali Khan', 'Sara', 'Bob Marley', 'Anna'];
  const bodies = ['plain text message', 'a *bold* claim', 'https://example.com/x', '\u{1F600}'];
  const lines: string[] = [];
  for (let i = 0; i < messageCount; i += 1) {
    const hour = i % 12 === 0 ? 12 : i % 12;
    lines.push(
      `[${(i % 28) + 1}/11/2026, ${hour}:${String(i % 60).padStart(2, '0')}:00 ${i % 24 >= 12 ? 'PM' : 'AM'}] ${authors[i % authors.length]}: ${bodies[i % bodies.length]}`,
    );
  }
  return lines.join('\n');
}

const text100k = buildLargeExport(100_000);

describe('parser throughput', () => {
  bench('detect 100k', () => {
    detectFormat(text100k);
  });

  bench('parse 100k', () => {
    const detected = detectFormat(text100k);
    if (detected.ok) {
      parseChat(text100k, { format: detected.value });
    }
  });
});
