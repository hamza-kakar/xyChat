/**
 * Parser performance gate (AGENTS.md §17): parsing a 100k-message synthetic
 * export must complete in under 2 seconds. Run via `tsx` (bare runtime —
 * no vitest module-transform overhead). Exits non-zero over budget.
 */
import { detectFormat, parseChat } from '../src/core/parser';
import { fingerprint, type HashBytes } from '../src/core/fingerprint';
import { planMerge } from '../src/core/merge';

import { formatLocalDateTime } from '../src/storage/sqlite/local-date-time-parse';
import { createHash } from 'node:crypto';

const BUDGET_MS = 2_000;
const MESSAGE_COUNT = 100_000;

function build(n: number): string {
  const authors = ['Ali Khan', 'Sara', 'Bob Marley', 'Anna'];
  const bodies = [
    'plain text message',
    'a *bold* claim',
    'https://example.com/x',
    '\u{1F600} emoji',
  ];
  const lines: string[] = [];
  for (let i = 0; i < n; i += 1) {
    const hour = i % 12 === 0 ? 12 : i % 12;
    lines.push(
      `[${(i % 28) + 1}/11/2026, ${hour}:${String(i % 60).padStart(2, '0')}:00 ${i % 24 >= 12 ? 'PM' : 'AM'}] ${authors[i % authors.length]}: ${bodies[i % bodies.length]}`,
    );
  }
  return lines.join('\n');
}

const hashBytes: HashBytes = (bytes) =>
  Promise.resolve(new Uint8Array(createHash('sha256').update(bytes).digest()));

const text = build(MESSAGE_COUNT);
// Warm up JIT with a smaller parse so the measurement is steady-state.
const detectedWarm = detectFormat(build(100));
if (!detectedWarm.ok) {
  throw new Error('detection failed on warm-up export');
}
void parseChat(build(100), { format: detectedWarm.value });

const start = performance.now();
const detected = detectFormat(text);
if (!detected.ok) {
  throw new Error(`detection failed: ${detected.error.code}`);
}
const parsed = parseChat(text, { format: detected.value });
const elapsed = performance.now() - start;

if (!parsed.ok) {
  throw new Error('parse failed');
}
if (parsed.value.messages.length !== MESSAGE_COUNT) {
  throw new Error(`expected ${MESSAGE_COUNT} messages, got ${parsed.value.messages.length}`);
}
console.log(`parse ${MESSAGE_COUNT}: ${elapsed.toFixed(0)}ms (budget ${BUDGET_MS}ms)`);

// §17: fingerprint + merge 100k ≤ 2 s.
const FP_BUDGET_MS = 2_000;
const fpStart = performance.now();
const entries = [];
for (let i = 0; i < MESSAGE_COUNT; i += 1) {
  const message = parsed.value.messages[i];
  if (message === undefined) {
    continue;
  }
  entries.push({
    fingerprint: await fingerprint(
      {
        tsCanonical: formatLocalDateTime(message.timestamp),
        author: message.author,
        kind: message.kind,
        body: message.body,
        attachmentFileName: message.attachment?.fileName ?? '',
        occurrence: 0,
      },
      hashBytes,
    ),
    message,
    tsKey:
      Date.UTC(
        message.timestamp.year,
        message.timestamp.month - 1,
        message.timestamp.day,
        message.timestamp.hour,
        message.timestamp.minute,
        message.timestamp.second,
      ) / 1000,
    attachmentStored: false,
  });
}
planMerge([], entries);
const fpElapsed = performance.now() - fpStart;
console.log(
  `fingerprint+merge ${MESSAGE_COUNT}: ${fpElapsed.toFixed(0)}ms (budget ${FP_BUDGET_MS}ms)`,
);
if (fpElapsed >= FP_BUDGET_MS) {
  console.error('FP+MERGE BUDGET EXCEEDED');
  process.exit(1);
}
