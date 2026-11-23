/**
 * Commit-port message dispatch: a gated
 * page module handling the db-side end of the commit MessageChannel. The
 * WHOLE message union is validated with Valibot — unknown or malformed
 * messages are ignored (no SQL runs) — and commit inputs pass the same
 *  validation as the RPC surface. Only this module touches the port;
 * db.worker wires it to the SQLite owner.
 */
import * as v from 'valibot';
import type { ImportCommitInput, ImportCommitResult } from '../storage/sqlite/import-commit';
import { rpcInput } from './rpc-validate';

/** The commit message union. Written-path batches never appear
 * here — bookkeeping goes through the recordWrittenPaths RPC. */
const COMMIT_MESSAGE = v.object({
  type: v.literal('commit'),
  requestId: v.number(),
  input: v.unknown(),
});

/** The answer posted back to import.worker (requestId-matched). */
export type CommitPortAnswer =
  | {
      readonly type: 'commit-result';
      readonly requestId: number;
      readonly result: ImportCommitResult;
    }
  | { readonly type: 'commit-error'; readonly requestId: number; readonly detail: string };

/** Deps injected by db.worker: the SQLite-backed commit. */
export interface CommitPortDeps {
  readonly commit: (input: ImportCommitInput) => ImportCommitResult;
}

/** Raw exception text can echo user values — answers carry the
 * error class name only. */
function errorNameOf(error: unknown): string {
  return error instanceof Error ? error.name : 'unknown error';
}

/**
 * Handles ONE commit-port message.
 *
 * @returns The answer to post, or null when the message is malformed or of
 *   an unknown type (ignored — no SQL runs).
 */
export function handleCommitMessage(deps: CommitPortDeps, raw: unknown): CommitPortAnswer | null {
  const parsed = v.safeParse(COMMIT_MESSAGE, raw);
  if (!parsed.success) {
    return null;
  }
  const input = rpcInput.tryCommitImport(parsed.output.input);
  if (input === null) {
    return { type: 'commit-error', requestId: parsed.output.requestId, detail: 'INVALID_INPUT' };
  }
  try {
    return {
      type: 'commit-result',
      requestId: parsed.output.requestId,
      result: deps.commit(input),
    };
  } catch (error) {
    return { type: 'commit-error', requestId: parsed.output.requestId, detail: errorNameOf(error) };
  }
}
