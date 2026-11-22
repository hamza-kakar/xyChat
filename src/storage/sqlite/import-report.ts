/**
 * The persisted import report (AGENTS.md §9.2 step 11, §12.7 import
 * history): counts only — never message content or file names (§15.4).
 * The import worker sends the run facts with the commit; the commit adds
 * its own counts and stores the whole report in `imports.report_json`.
 */
import * as v from 'valibot';

/** Largest count a report field may carry (export size limits are far below). */
const MAX_COUNT = 10_000_000;
const COUNT = v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(MAX_COUNT));
const DURATION_MS = v.pipe(
  v.number(),
  v.integer(),
  v.minValue(0),
  v.maxValue(Number.MAX_SAFE_INTEGER),
);
/** Parse warning codes are short identifiers (§8.2). */
const WARNING_CODE = v.pipe(v.string(), v.regex(/^[A-Z_]{1,64}$/u));
/** At most one entry per warning code. */
const MAX_WARNING_CODES = 32;

/** Run facts the import worker sends with the commit. */
export const ImportRunFactsSchema = v.object({
  warningsByCode: v.pipe(
    v.record(WARNING_CODE, COUNT),
    v.check((value) => Object.keys(value).length <= MAX_WARNING_CODES, 'too many warning codes'),
  ),
  mediaStored: COUNT,
  mediaMissing: COUNT,
  mediaOmitted: COUNT,
  durationMs: DURATION_MS,
});

/** The stored report: the run facts plus the commit counts. */
export const ImportReportSchema = v.object({
  ...ImportRunFactsSchema.entries,
  messagesAdded: COUNT,
  duplicatesSkipped: COUNT,
  mediaUpgraded: COUNT,
});

/** Run facts the import worker sends with the commit. */
export type ImportRunFacts = v.InferOutput<typeof ImportRunFactsSchema>;

/** The stored import report. */
export type ImportReport = v.InferOutput<typeof ImportReportSchema>;

/**
 * Reads a stored `report_json` value.
 *
 * @param text The column value (null until the import completes).
 * @returns The validated report, or null when absent or invalid (an
 *   invalid report is shown as "no details", never guessed, §18.5).
 */
export function parseImportReport(text: string | null): ImportReport | null {
  if (text === null) {
    return null;
  }
  let json: unknown;
  try {
    json = JSON.parse(text) as unknown;
  } catch {
    return null;
  }
  const result = v.safeParse(ImportReportSchema, json);
  return result.success ? result.output : null;
}
