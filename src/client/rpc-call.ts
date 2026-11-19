/**
 * Injectable RPC caller (AGENTS.md §18.8, review Major 6): every worker call
 * carries its METHOD NAME (for timeout exemption and diagnostics), runs
 * under a timeout whose timer never outlives the settlement (no dangling
 * rejection), and reports failures to a sink so the app layer can log them
 * with the diagnostic id (§18.7 — client has no logger imports, §3.1).
 */

/** Failure classes reported to the sink. */
export type RpcErrorCode = 'TIMEOUT' | 'INTERNAL' | 'DB_UNAVAILABLE';

/** One failed RPC, keyed by diagnostic id the user can quote (§18.7). */
export interface RpcErrorEvent {
  readonly code: RpcErrorCode;
  readonly method: string;
  readonly diagnosticId: string;
  readonly detail: string;
}

/** Sink for failed RPCs; the app registers a logger-backed implementation. */
export type RpcErrorSink = (event: RpcErrorEvent) => void;

/** Dependencies injected for testability (§18.4). */
export interface RpcCallerDeps {
  /** Boots the worker once; false means the database is unavailable. */
  readonly ensureReady: () => Promise<boolean>;
  /** Timeout for non-exempt calls (§18.8). */
  readonly timeoutMs: number;
  /** Method names exempt from the timeout (long-running imports). */
  readonly exempt: ReadonlySet<string>;
}

/** The caller surface used by db-client. */
export interface RpcCaller {
  /** Invokes `fn` under the timeout regime; `method` names the RPC. */
  call: <T>(fn: () => Promise<T>, method: string) => Promise<T>;
  /** Registers (or clears with null) the failure sink. */
  setSink: (sink: RpcErrorSink | null) => void;
}

/**
 * Creates the RPC caller. Failures throw Errors whose message starts with
 * the failure code (`TIMEOUT:` / `INTERNAL:` / `DB_UNAVAILABLE:`) and carry
 * the diagnostic id; every failure is also reported to the sink exactly once.
 */
export function createRpcCaller(deps: RpcCallerDeps): RpcCaller {
  const { ensureReady, timeoutMs, exempt } = deps;
  let sink: RpcErrorSink | null = null;
  let diagnosticCounter = 0;

  const report = (
    code: RpcErrorCode,
    method: string,
    diagnosticId: string,
    detail: string,
  ): void => {
    sink?.({ code, method, diagnosticId, detail: detail.slice(0, 200) });
  };

  // The timer is cleared on settle — a resolved call never leaves a pending
  // rejection around (which would surface as an unhandled rejection).
  const withTimeout = <T>(promise: Promise<T>, method: string, diagnosticId: string): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        const error = new Error(
          `TIMEOUT: ${method} exceeded ${timeoutMs}ms (id ${diagnosticId})`,
        );
        report('TIMEOUT', method, diagnosticId, error.message);
        reject(error);
      }, timeoutMs);
      promise.then(
        (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        (error: unknown) => {
          clearTimeout(timer);
          reject(error);
        },
      );
    });

  return {
    async call<T>(fn: () => Promise<T>, method: string): Promise<T> {
      const ready = await ensureReady();
      if (!ready) {
        const diagnosticId = 'n/a';
        report('DB_UNAVAILABLE', method, diagnosticId, 'database unavailable');
        throw new Error('DB_UNAVAILABLE: database unavailable (unsupported browser or open failure)');
      }
      const diagnosticId = `${Date.now().toString(36)}-${(diagnosticCounter += 1).toString(36)}`;
      const pending = exempt.has(method) ? fn() : withTimeout(fn(), method, diagnosticId);
      try {
        return await pending;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.startsWith('TIMEOUT:')) {
          // Already reported by the timer; rethrow as-is so callers can
          // distinguish timeouts from internal failures.
          throw error;
        }
        report('INTERNAL', method, diagnosticId, message);
        throw new Error(
          `INTERNAL: ${method} failed (id ${diagnosticId}): ${message.slice(0, 120)}`,
          { cause: error },
        );
      }
    },
    setSink(next: RpcErrorSink | null): void {
      sink = next;
    },
  };
}
