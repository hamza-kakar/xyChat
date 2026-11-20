/**
 * Typed import.worker client (AGENTS.md §3.1): spawns the worker, wraps it
 * in Comlink, and runs calls through the shared RPC caller (§18.8). The
 * detection outcome is enriched on the main thread with the merge-target
 * suggestion (§9.2 step 4: title match against existing chats) so the UI
 * needs exactly one call.
 */
import * as Comlink from 'comlink';
import { createRpcCaller, type RpcErrorSink } from './rpc-call';
import { dbClient } from './db-client';
import type {
  BeginAnswer,
  BeginOptions,
  DetectAnswer,
  ImportWorkerApi,
  RunReport,
} from '../workers/import-api';
import type { DetectReport, ImportError } from '../workers/import-detect';
import type { ImportCommitResult } from '../storage/sqlite/import-commit';
import { newChatId, newImportId } from '../core/ids';
import { PARSER_VERSION } from '../core/parser';
import type { DetectedFormat } from '../core/parser';
import type { ChatId } from '../core/ids';

/** Detection outcome including the merge-target suggestion. */
export interface DetectOutcome {
  readonly report: DetectReport;
  /** Existing chat whose title matches, for the "update existing" preselect
   * (§12.8.4). Null when the database is unavailable or nothing matches. */
  readonly suggestedTargetChatId: ChatId | null;
}

let worker: Worker | null = null;
let api: Comlink.Remote<ImportWorkerApi> | null = null;

/** Spawns the worker once and returns the remote API. */
function remote(): Comlink.Remote<ImportWorkerApi> {
  if (api === null) {
    worker = new Worker(new URL('../workers/import.worker.ts', import.meta.url), {
      type: 'module',
    });
    api = Comlink.wrap<ImportWorkerApi>(worker);
  }
  return api;
}

const caller = createRpcCaller({
  // Detection never depends on the database boot.
  ensureReady: () => Promise.resolve(true),
  timeoutMs: 10_000,
  // begin() runs the whole pipeline (minutes on large exports) — exempt
  // from the RPC timeout like commitImport (§18.8).
  exempt: new Set<string>(['begin']),
});

/** The cancel flag the UI flips; the worker polls it via the proxied hook
 * (§9.3: user cancel during any phase). */
let cancelled = false;

/** Subscriptions to §9.1 progress events. */
type ProgressListener = (event: {
  readonly phase: string;
  readonly current: number;
  readonly total: number;
}) => void;
const progressListeners = new Set<ProgressListener>();

/** Registers the failure sink (logger-backed; app calls this at boot). */
export function setImportErrorSink(sink: RpcErrorSink | null): void {
  caller.setSink(sink);
}

/** Sets the cancel flag checked by the running pipeline (§9.3). */
export function cancelImport(): void {
  cancelled = true;
}

/** Subscribes to §9.1 progress events; returns the unsubscribe function. */
export function onImportProgress(listener: ProgressListener): () => void {
  progressListeners.add(listener);
  return () => {
    progressListeners.delete(listener);
  };
}

/** Test seam: emits one progress event to the current subscribers (the
 * worker path emits through the proxied hook, §9.1). */
export function emitImportProgress(event: {
  readonly phase: string;
  readonly current: number;
  readonly total: number;
}): void {
  for (const listener of progressListeners) {
    listener(event);
  }
}

/** The main-thread-facing import client. */
export const importClient = {
  /**
   * Detection phase (§9.2 step 4): runs in the worker, then enriches with
   * the title-match merge suggestion from the db client.
   */
  detect: async (
    file: Blob,
    fileName: string,
    localeHint?: string,
    dateOrderOverride?: 'DMY' | 'MDY',
  ): Promise<DetectOutcome | ImportError> => {
    const answer = await caller.call(
      (): Promise<DetectAnswer> => remote().detect(file, fileName, localeHint, dateOrderOverride),
      'detect',
    );
    if (!answer.ok) {
      return answer.error;
    }
    return {
      report: answer.report,
      suggestedTargetChatId: await suggestTarget(answer.report.title),
    };
  },

  /**
   * Runs the confirmed pipeline (§9.2 steps 5–11): mints the import row
   * (§9.3: in_progress BEFORE media writes), wires the commit MessagePort
   * (§3.2), and drives the worker through parse → fingerprint → media →
   * commit with proxied progress/cancel hooks. Marks the import cancelled
   * or failed when the pipeline answers with an error.
   */
  begin: async (request: BeginRequest): Promise<BeginOutcome | ImportError> => {
    cancelled = false;
    const importId = newImportId();
    const chatId = request.targetChatId ?? newChatId();
    await dbClient.createImportRecord({
      importId,
      fileName: request.fileName,
      fileBytes: request.file.size,
      parserVersion: PARSER_VERSION,
    });
    // §9.2 step 8 (review Blocker 2): fingerprints whose media is already
    // stored — the media phase skips rewriting those files.
    const alreadyStored =
      request.targetChatId !== null
        ? new Set(await dbClient.listStoredFingerprints(request.targetChatId))
        : new Set<string>();
    const channel = new MessageChannel();
    await dbClient.connectCommitPort(Comlink.transfer(channel.port1, [channel.port1]));
    const hooks = {
      onProgress: (event: { phase: string; current: number; total: number }) => {
        for (const listener of progressListeners) {
          listener(event);
        }
      },
      isCancelled: () => cancelled,
      onWrittenPaths: (paths: readonly string[]) => dbClient.recordWrittenPaths(importId, paths),
    };
    const beginOptions: BeginOptions = {
      file: request.file,
      fileName: request.fileName,
      confirmed: {
        format: request.format,
        title: request.title,
        isGroup: request.isGroup,
        chatId,
        alreadyStored,
      },
      importId,
    };
    // Comlink honors transfer markers at the TOP level only — the port and
    // the proxied hooks are separate arguments (§3.2).
    await caller.call(
      () => remote().setCommitPort(Comlink.transfer(channel.port2, [channel.port2])),
      'setCommitPort',
    );
    const answer = await caller.call(
      (): Promise<BeginAnswer> => remote().begin(beginOptions, Comlink.proxy(hooks)),
      'begin',
    );
    if (!answer.ok) {
      if (answer.error.code === 'CANCELLED') {
        await dbClient.markImportCancelled(importId);
      } else {
        await dbClient.markImportFailed(importId);
      }
      return answer.error;
    }
    return { commit: answer.commit, report: answer.report, chatId };
  },
};

/** Best-effort title match against existing chats (§12.8.4); null when the
 * database is unavailable or nothing matches — the UI offers "new chat". */
async function suggestTarget(title: string): Promise<ChatId | null> {
  try {
    const chats = await dbClient.listChats();
    return chats.find((chat) => chat.title === title)?.id ?? null;
  } catch {
    return null;
  }
}

/** Everything the report screen (§12.8.6) needs after a successful run. */
export interface BeginOutcome {
  readonly commit: ImportCommitResult;
  readonly report: RunReport;
  readonly chatId: ChatId;
}

/** The confirmed choices for begin(). */
export interface BeginRequest {
  readonly file: Blob;
  readonly fileName: string;
  readonly format: DetectedFormat;
  readonly title: string;
  readonly isGroup: boolean;
  /** Existing chat to merge into, or null for a new chat (§12.8.4). */
  readonly targetChatId: ChatId | null;
}
