/**
 * Import run phases (AGENTS.md §9.1, §9.2 steps 6–7): parse the confirmed
 * text into messages with §8.10 fingerprints, reporting progress and
 * honoring cancellation. Pure module (no Comlink, no worker globals; the
 * hash function is injected, §8.10) so it is unit-tested in Node;
 * import.worker calls it. The merge plan itself runs inside the commit
 * transaction (import-commit-apply.ts, §8.10) — this phase only prepares
 * the incoming side.
 */
import { err, ok, type Result } from '../core/result';
import { fingerprint, type FingerprintInput, type HashBytes } from '../core/fingerprint';
import {
  parseChatIterator,
  type DetectedFormat,
  type ParseEvent,
  type ParseStats,
  type ParseWarning,
} from '../core/parser';
import { formatLocalDateTime } from '../storage/sqlite/local-date-time-parse';
import type { ParsedMessage } from '../core/model';
import type { InsertableMessage } from '../storage/sqlite/import-commit';
import type { ImportError } from './import-detect';
import type { ImportHooks, ImportProgressEvent } from './import-progress';

/** Progress callbacks; every phase reports at most every 5,000 items (§8.2).
 * Re-exported for the worker API's typing. */
export type RunHooks = ImportHooks;
export type RunProgress = ImportProgressEvent;

/** The run outcome: commit-ready messages plus the facts for the report. */
export interface ImportRunResult {
  /** Messages with complete §8.10 fingerprints, in file order. */
  readonly messages: readonly InsertableMessage[];
  /** Parse warnings grouped by code with counts (§9.2 step 11). */
  readonly warningsByCode: Readonly<Record<string, number>>;
  /** Parse stats for the report (§8.2). */
  readonly stats: ParseStats;
  /** U+FFFD count in the decoded text (§9.2 step 3). */
  readonly replacementChars: number;
}

/** Messages per progress emission and cancellation check (§8.2: at most
 * every 5,000 items). */
const PROGRESS_EVERY = 5_000;

/**
 * Parses and fingerprints the confirmed export text.
 *
 * @param text The decoded chat text (from readArchive, §9.2 step 3).
 * @param format The user-confirmed format (§9.2 step 5, §12.8).
 * @param hashBytes Injected SHA-256 (§8.10).
 * @param hooks Progress and cancellation hooks (§18.8).
 * @returns Commit-ready messages, or a structured failure (CANCELLED).
 */
export async function runImportParse(
  text: string,
  format: DetectedFormat,
  hashBytes: HashBytes,
  hooks: RunHooks,
): Promise<Result<ImportRunResult, ImportError>> {
  const parsed = await drainParse(text, format, hooks);
  if (!parsed.ok) {
    return parsed;
  }

  const fingerprinted = await fingerprintAll(parsed.value.messages, hashBytes, hooks);
  if (!fingerprinted.ok) {
    return fingerprinted;
  }

  const warningsByCode: Record<string, number> = {};
  for (const warning of parsed.value.warnings) {
    warningsByCode[warning.code] = (warningsByCode[warning.code] ?? 0) + 1;
  }

  return ok({
    messages: fingerprinted.value,
    warningsByCode,
    stats: parsed.value.stats,
    replacementChars: countReplacements(text),
  });
}

/** The parse outcome (pre-fingerprint). */
interface ParsedBatch {
  readonly messages: readonly ParsedMessage[];
  readonly warnings: readonly ParseWarning[];
  readonly stats: ParseStats;
}

/** Drives the parser iterator, collecting messages and warnings. Cancellation
 * is checked on progress events — latency is at most PROGRESS_EVERY lines
 * (§18.8). Malformed lines arrive as warnings and never stop the run (§8.1). */
async function drainParse(
  text: string,
  format: DetectedFormat,
  hooks: RunHooks,
): Promise<Result<ParsedBatch, ImportError>> {
  const iterator = parseChatIterator(text, { format });
  const messages: ParsedMessage[] = [];
  let lastReported = 0;
  let stepped = iterator.next();
  while (stepped.done !== true) {
    const event: ParseEvent = stepped.value;
    if (event.type === 'message') {
      messages.push(event.message);
    } else if (event.type === 'progress') {
      if (await hooks.isCancelled()) {
        return err({ code: 'CANCELLED', detail: 'cancelled during parse' });
      }
      if (event.linesProcessed - lastReported >= PROGRESS_EVERY) {
        lastReported = event.linesProcessed;
        hooks.onProgress({
          phase: 'parsing',
          current: event.linesProcessed,
          total: event.totalLines,
        });
      }
    }
    stepped = iterator.next();
  }
  // The completed summary carries ALL warnings (§8.2), including the
  // pre-first-header orphan line that never arrives as a yielded event.
  return ok({
    messages,
    warnings: stepped.value.warnings,
    stats: stepped.value.stats,
  });
}

/** Computes §8.10 fingerprints with occurrence counting, reporting progress
 * and checking cancellation at most every PROGRESS_EVERY messages. */
async function fingerprintAll(
  messages: readonly ParsedMessage[],
  hashBytes: HashBytes,
  hooks: RunHooks,
): Promise<Result<readonly InsertableMessage[], ImportError>> {
  const occurrences = new Map<string, number>();
  const out: InsertableMessage[] = [];
  let lastReported = 0;
  for (const [index, message] of messages.entries()) {
    const input: FingerprintInput = {
      tsCanonical: formatLocalDateTime(message.timestamp),
      author: message.author,
      kind: message.kind,
      body: message.body,
      attachmentFileName: message.attachment?.fileName ?? '',
      occurrence: nextOccurrence(occurrences, message),
    };
    out.push({ fingerprint: await fingerprint(input, hashBytes), message });
    if (index - lastReported >= PROGRESS_EVERY) {
      lastReported = index;
      if (await hooks.isCancelled()) {
        return err({ code: 'CANCELLED', detail: 'cancelled during fingerprinting' });
      }
      hooks.onProgress({ phase: 'fingerprinting', current: index, total: messages.length });
    }
  }
  return ok(out);
}

/** Returns the occurrence counter for a message and increments it (§8.10:
 * identical tuples get 0, 1, 2, …). */
function nextOccurrence(occurrences: Map<string, number>, message: ParsedMessage): number {
  const key = [
    formatLocalDateTime(message.timestamp),
    message.author ?? '',
    message.kind,
    message.body,
    message.attachment?.fileName ?? '',
  ].join('\u001F');
  const current = occurrences.get(key) ?? 0;
  occurrences.set(key, current + 1);
  return current;
}

/** Counts U+FFFD in decoded text (§9.2 step 3). */
function countReplacements(text: string): number {
  let count = 0;
  for (const char of text) {
    if (char === '\uFFFD') {
      count += 1;
    }
  }
  return count;
}
