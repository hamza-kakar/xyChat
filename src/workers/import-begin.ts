/**
 * Import pipeline orchestration (AGENTS.md §9.2 steps 5–11): the confirmed pipeline — re-read archive → parse + fingerprint →
 * media writes → commit over the §3.2 MessagePort — lives in this gated
 * page module; import.worker.ts only wires production IO adapters.
 *
 * Rollback (§9.3): every failure AFTER the media phase
 * (commit error, flush throw, unexpected exception) deletes the written
 * paths before answering, and cancellation is checked once more just
 * before the commit.
 */
import { err, ok, type Result } from '../core/result';
import { PARSER_VERSION } from '../core/parser';
import { readArchive } from './archive-reader';
import { runImportParse } from './import-run';
import { writeImportMedia, type MediaPhaseDeps } from './import-media';
import type { ImportCommitInput, ImportCommitResult } from '../storage/sqlite/import-commit';
import type { ConfirmedImport, RunReport } from './import-api';
import type { ImportError } from './import-detect';
import type { ImportHooks } from './import-progress';

/** Raw exception text can echo file names or values (§15.4) — the UI
 * carries the error class name only; the full text stays in the worker
 * logger sink (§18.7). */
function errorNameOf(error: unknown): string {
  return error instanceof Error ? error.name : 'unknown error';
}

/** Commit-port protocol (§3.2): requests carry a requestId; the answer with
 * the matching id resolves the wait. */
interface CommitRequest {
  readonly type: 'commit';
  readonly requestId: number;
  readonly input: ImportCommitInput;
}

interface CommitAnswer {
  readonly type: 'commit-result' | 'commit-error';
  readonly requestId: number;
  readonly result?: ImportCommitResult;
  readonly detail?: string;
}

/** Sends the commit request over the port and waits for the answer (§3.2:
 * import.worker → db.worker; db.worker owns SQLite). */
function commitOverPort(
  port: MessagePort,
  input: ImportCommitInput,
): Promise<Result<ImportCommitResult, ImportError>> {
  const requestId = Math.floor(Math.random() * 2 ** 31);
  return new Promise((resolve) => {
    port.onmessage = (event: MessageEvent) => {
      const data = event.data as CommitAnswer;
      if (data.requestId !== requestId) {
        return;
      }
      if (data.type === 'commit-result' && data.result !== undefined) {
        resolve(ok(data.result));
        return;
      }
      resolve(
        err({ code: 'COMMIT_FAILED', detail: (data.detail ?? 'commit failed').slice(0, 80) }),
      );
    };
    port.postMessage({ type: 'commit', requestId, input } satisfies CommitRequest);
  });
}

/** Assembles the §9.2-step-10 commit input from the phase results. */
export function assembleCommitInput(
  file: Blob,
  confirmed: ConfirmedImport,
  phases: {
    readonly fileName: string;
    readonly importId: string;
    readonly messages: ImportCommitInput['messages'];
    readonly attachments: ImportCommitInput['attachments'];
    readonly report: RunReport;
  },
): ImportCommitInput {
  return {
    importId: phases.importId,
    targetChatId: confirmed.chatId,
    newChat: {
      title: confirmed.title,
      isGroup: confirmed.isGroup,
      sourcePlatform: confirmed.format.platform,
      dateOrder: confirmed.format.dateOrder,
    },
    messages: phases.messages,
    attachments: phases.attachments,
    fileName: phases.fileName,
    fileBytes: file.size,
    parserVersion: PARSER_VERSION,
    report: {
      warningsByCode: phases.report.warningsByCode,
      mediaStored: phases.report.mediaStored,
      mediaMissing: phases.report.mediaMissing,
      mediaOmitted: phases.report.mediaOmitted,
      durationMs: phases.report.durationMs,
    },
  };
}

/** Builds the §9.2-step-11 report facts. */
export function buildReport(
  run: {
    readonly warningsByCode: Readonly<Record<string, number>>;
    readonly stats: {
      readonly lines: number;
      readonly messages: number;
      readonly system: number;
      readonly media: number;
    };
    readonly replacementChars: number;
  },
  attachments: ImportCommitInput['attachments'],
  durationMs: number,
): RunReport {
  const countBy = (status: 'present' | 'missing' | 'omitted'): number =>
    attachments.filter((row) => row.status === status).length;
  return {
    warningsByCode: run.warningsByCode,
    stats: run.stats,
    replacementChars: run.replacementChars,
    durationMs,
    mediaStored: countBy('present'),
    mediaMissing: countBy('missing'),
    mediaOmitted: countBy('omitted'),
  };
}

/** Rollback helper for failures AFTER the media phase (§9.3): the commit
 * never ran, so the written files are orphans — delete them
 * with the same deps the media phase used. */
async function rollbackWritten(
  mediaIO: MediaPhaseDeps,
  writtenPaths: readonly string[],
): Promise<void> {
  for (const path of writtenPaths) {
    await mediaIO.deleteFile(path);
  }
}

/** Options for {@link runPipeline} — the shell injects production IO. */
export interface PipelineOptions {
  readonly file: Blob;
  readonly fileName: string;
  readonly confirmed: ConfirmedImport;
  readonly importId: string;
  readonly commitPort: MessagePort;
  readonly hooks: ImportHooks;
  /** Production IO adapters (opened archive, sync-handle sink, delete). */
  readonly mediaIO: MediaPhaseDeps;
  readonly hashBytes: (bytes: Uint8Array) => Promise<Uint8Array>;
  /** Reads the chat text (from readArchive, §9.2 steps 1–3); injectable for
   * tests. */
  readonly readArchiveFn?: typeof readArchive;
}

/** Everything after the media phase: flush, cancel check, commit over the
 * port — with §9.3 rollback of the written files on any failure. */
async function finishAfterMedia(
  file: Blob,
  confirmed: ConfirmedImport,
  state: {
    readonly fileName: string;
    readonly importId: string;
    readonly messages: ImportCommitInput['messages'];
    readonly attachments: ImportCommitInput['attachments'];
    readonly warningsByCode: Readonly<Record<string, number>>;
    readonly stats: {
      readonly lines: number;
      readonly messages: number;
      readonly system: number;
      readonly media: number;
    };
    readonly replacementChars: number;
    readonly writtenPaths: readonly string[];
    readonly mediaIO: MediaPhaseDeps;
    readonly commitPort: MessagePort;
    readonly hooks: ImportHooks;
    readonly startedAt: number;
  },
): Promise<
  | { readonly ok: true; readonly commit: ImportCommitResult; readonly report: RunReport }
  | { readonly ok: false; readonly error: ImportError }
> {
  const { mediaIO, writtenPaths, hooks } = state;

  // Final cumulative flush so the import row is complete BEFORE the commit
  // (§9.3 crash safety). A throw here is rolled back below.
  await hooks.onWrittenPaths?.(writtenPaths);

  // §9.3: one more cancellation check just before the commit.
  if (await hooks.isCancelled()) {
    await rollbackWritten(mediaIO, writtenPaths);
    return { ok: false, error: { code: 'CANCELLED', detail: 'cancelled before commit' } };
  }

  // §9.2 step 10: commit over the port, with the report it stores.
  const report = buildReport(state, state.attachments, Date.now() - state.startedAt);
  const input = assembleCommitInput(file, confirmed, { ...state, report });
  const committed = await commitOverPort(state.commitPort, input);
  if (!committed.ok) {
    // §9.3: the commit failed — the written files would be orphans (the
    // row leaves in_progress via markImportFailed).
    await rollbackWritten(mediaIO, writtenPaths);
    return { ok: false, error: committed.error };
  }
  state.commitPort.close();

  // §9.2 step 11: report facts for the UI.
  return { ok: true, commit: committed.value, report };
}

/**
 * Runs the confirmed import pipeline (§9.2 steps 6–11): re-reads the
 * archive, parses and fingerprints with the confirmed format, writes media
 * (skipping already-stored fingerprints), flushes the cumulative
 * written-path bookkeeping, checks cancellation once more, and commits
 * over the §3.2 port. Any failure after the media phase rolls the written
 * files back before answering (§9.3).
 *
 * @returns The commit counts plus the §9.2-step-11 report facts, or a
 *   structured failure.
 */
export async function runPipeline(
  options: PipelineOptions,
): Promise<
  | { readonly ok: true; readonly commit: ImportCommitResult; readonly report: RunReport }
  | { readonly ok: false; readonly error: ImportError }
> {
  const { file, fileName, confirmed, importId, commitPort, hooks, mediaIO, hashBytes } = options;
  const startedAt = Date.now();
  // Shared with the media phase, so the catch below sees every touched
  // path even when the phase throws (§9.3).
  const writtenPaths: string[] = [];
  try {
    // §9.2 steps 1–3: re-read the archive (the detection read is not kept —
    // the worker stays stateless between detect and begin).
    hooks.onProgress({ phase: 'reading-archive', current: 0, total: 1 });
    const readFn = options.readArchiveFn ?? readArchive;
    const archive = await readFn(file, fileName);
    if (!archive.ok) {
      return { ok: false, error: { code: archive.error.code, detail: archive.error.detail } };
    }

    // §9.2 steps 6–7: parse + fingerprint with the CONFIRMED format.
    const run = await runImportParse(archive.value.text, confirmed.format, hashBytes, hooks);
    if (!run.ok) {
      return { ok: false, error: run.error };
    }

    // §9.2 steps 8–9: media writes with §9.3 bookkeeping (flushes run
    // after every write; failures inside the phase roll back themselves).
    const media = await writeImportMedia({
      chatId: confirmed.chatId,
      messages: run.value.messages,
      alreadyStored: confirmed.alreadyStored,
      deps: mediaIO,
      hooks,
      writtenPaths,
    });
    if (!media.ok) {
      return { ok: false, error: media.error };
    }
    return await finishAfterMedia(file, confirmed, {
      fileName,
      importId,
      messages: run.value.messages,
      attachments: media.value.attachments,
      warningsByCode: run.value.warningsByCode,
      stats: run.value.stats,
      replacementChars: run.value.replacementChars,
      writtenPaths,
      mediaIO,
      commitPort,
      hooks,
      startedAt,
    });
  } catch (error) {
    // §9.3: an unexpected exception during or after the media phase must
    // still roll the touched files back.
    await rollbackWritten(mediaIO, writtenPaths);
    return { ok: false, error: { code: 'INTERNAL', detail: errorNameOf(error) } };
  }
}
