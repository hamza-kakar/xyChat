/**
 * import.worker (AGENTS.md §3.2, §9.1): CPU- and IO-heavy import work off
 * the main thread. It never touches SQLite directly (§3.2) — the commit
 * goes through db.worker. Thin shell: the phase logic lives in testable
 * page modules (import-detect.ts now; the pipeline modules land with the
 * remaining M3 commits), per the ratified ADR 0007 addendum.
 */
import * as Comlink from 'comlink';
import { detectExport, type ImportError } from './import-detect';
import type { DetectAnswer, ImportWorkerApi } from './import-api';

/** Error detail is already structured; detectExport never throws expected
 * failures. Unexpected exceptions serialize to INTERNAL (§18.7). */
function toInternalError(error: unknown): ImportError {
  return { code: 'INTERNAL', detail: String(error).slice(0, 200) };
}

const api: ImportWorkerApi = {
  async detect(file, fileName, localeHint): Promise<DetectAnswer> {
    try {
      const options = localeHint === undefined ? {} : { localeHint };
      const result = await detectExport(fileName, file, options);
      return result.ok ? { ok: true, report: result.value } : { ok: false, error: result.error };
    } catch (error) {
      return { ok: false, error: toInternalError(error) };
    }
  },
};

// Expose the API. Comlink's expose returns void; the worker stays alive
// serving messages until terminated.
Comlink.expose(api, self);
