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
import type { DetectAnswer, ImportWorkerApi } from '../workers/import-api';
import type { DetectReport, ImportError } from '../workers/import-detect';
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
  exempt: new Set<string>(),
});

/** Registers the failure sink (logger-backed; app calls this at boot). */
export function setImportErrorSink(sink: RpcErrorSink | null): void {
  caller.setSink(sink);
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
  ): Promise<DetectOutcome | ImportError> => {
    const answer = await caller.call(
      (): Promise<DetectAnswer> => remote().detect(file, fileName, localeHint),
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

/** Test seam: resets the cached worker. */
export function resetImportClientForTests(): void {
  worker?.terminate();
  worker = null;
  api = null;
}
