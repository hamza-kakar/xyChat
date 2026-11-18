/**
 * Browser capability detection (AGENTS.md §12.11). Every check must pass
 * before the app renders; a failure produces a full-screen explanation,
 * never a blank page. The FTS5-trigram check joins in M2, where the single
 * SQLite connection lives (ADR 0008).
 */

export type CapabilityId =
  'moduleWorkers' | 'webAssembly' | 'opfs' | 'syncAccessHandle' | 'cryptoSubtle' | 'navigatorLocks';

export interface CapabilityFailure {
  readonly id: CapabilityId;
  /**
   * Engine-provided error text for diagnostics (logger / e2e snapshots).
   * Never rendered to users directly; the UI shows localized names only.
   */
  readonly reason: string;
}

export interface CapabilityReport {
  readonly ok: boolean;
  readonly failures: readonly CapabilityFailure[];
}

interface WorkerReply {
  readonly ok: boolean;
  readonly error: string;
}

/** Worker source used to probe module workers plus OPFS sync access handles. */
const PROBE_WORKER_SOURCE = `
self.onmessage = async () => {
  try {
    const root = await navigator.storage.getDirectory();
    const probeDir = await root.getDirectoryHandle('capability-probe', { create: true });
    const file = await probeDir.getFileHandle('probe', { create: true });
    const handle = await file.createSyncAccessHandle();
    handle.close();
    await probeDir.removeEntry('probe');
    await root.removeEntry('capability-probe');
    self.postMessage({ ok: true, error: '' });
  } catch (error) {
    self.postMessage({ ok: false, error: String(error) });
  }
};
`;

interface StorageProbeOutcome {
  readonly moduleWorkers: boolean;
  readonly syncAccessHandle: boolean;
  readonly syncAccessHandleReason: string;
}

/** Worker reply, or null when it never answered within the timeout. */
async function askProbeWorker(): Promise<WorkerReply | null> {
  const blob = new Blob([PROBE_WORKER_SOURCE], { type: 'text/javascript' });
  const url = URL.createObjectURL(blob);
  try {
    const worker = new Worker(url, { type: 'module' });
    const outcome = await new Promise<WorkerReply | null>((resolve) => {
      const timer = setTimeout(() => {
        resolve(null);
      }, WORKER_PROBE_TIMEOUT_MS);
      worker.onmessage = (event: MessageEvent<unknown>) => {
        clearTimeout(timer);
        const reply = event.data as Partial<WorkerReply> | null;
        resolve({
          ok: reply?.ok === true,
          error: typeof reply?.error === 'string' ? reply.error : '',
        });
      };
      worker.onerror = (event: ErrorEvent) => {
        clearTimeout(timer);
        resolve({ ok: false, error: event.message || 'worker construction failed' });
      };
      worker.postMessage('probe');
    });
    worker.terminate();
    return outcome;
  } catch (error) {
    return { ok: false, error: String(error) };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Outcome of the ONE storage-probe worker spawned per app load; both the
 * moduleWorkers and syncAccessHandle probes read this cached result instead
 * of spawning a second worker (review M0 round 1, minor 16).
 */
let cachedStorageProbe: Promise<StorageProbeOutcome> | null = null;

function storageProbe(): Promise<StorageProbeOutcome> {
  cachedStorageProbe ??= (async (): Promise<StorageProbeOutcome> => {
    const first = await askProbeWorker();
    if (first === null) {
      // Timeout: final (a timeout is not transient) — keeps boot bounded.
      return {
        moduleWorkers: false,
        syncAccessHandle: false,
        syncAccessHandleReason: 'worker did not respond within the probe timeout',
      };
    }
    if (first.ok) {
      return { moduleWorkers: true, syncAccessHandle: true, syncAccessHandleReason: '' };
    }
    // First-run storage initialization can fail transiently (fresh profile);
    // retry once with a fresh worker, then settle on the second answer.
    const second = await delay(WORKER_RETRY_DELAY_MS).then(() => askProbeWorker());
    if (second === null) {
      return {
        moduleWorkers: false,
        syncAccessHandle: false,
        syncAccessHandleReason: 'worker did not respond within the probe timeout',
      };
    }
    return {
      moduleWorkers: true,
      syncAccessHandle: second.ok,
      syncAccessHandleReason: second.error,
    };
  })();
  return cachedStorageProbe;
}

/** Minimal valid WASM module (empty function) — used to validate WebAssembly. */
const MINIMAL_WASM_BYTES = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);

function probeWebAssembly(): boolean {
  try {
    return WebAssembly.validate(MINIMAL_WASM_BYTES);
  } catch {
    return false;
  }
}

function probeCryptoSubtle(): boolean {
  try {
    return typeof crypto.subtle.digest === 'function';
  } catch {
    return false;
  }
}

function probeNavigatorLocks(): boolean {
  try {
    return typeof navigator.locks.request === 'function';
  } catch {
    return false;
  }
}

export type ProbeResult = boolean | CapabilityFailure;
export type CapabilityProbes = Readonly<
  Record<CapabilityId, () => ProbeResult | Promise<ProbeResult>>
>;

/**
 * The real browser probes, exposed for tests to substitute. Worker-side
 * failures surface as structured results (final, no retry — a worker that
 * answered 'fail' answered deterministically); only a *thrown* main-thread
 * OPFS error is retried, because engines under memory pressure report
 * transient UnknownError there.
 */
export const defaultProbes: CapabilityProbes = {
  moduleWorkers: async () => {
    const outcome = await storageProbe();
    return outcome.moduleWorkers
      ? true
      : { id: 'moduleWorkers', reason: 'module worker construction failed' };
  },
  webAssembly: probeWebAssembly,
  opfs: async () => {
    // Thrown errors propagate to the retry loop in checkCapabilities.
    await navigator.storage.getDirectory();
    return true;
  },
  syncAccessHandle: async () => {
    const outcome = await storageProbe();
    return outcome.syncAccessHandle
      ? true
      : { id: 'syncAccessHandle', reason: outcome.syncAccessHandleReason };
  },
  cryptoSubtle: probeCryptoSubtle,
  navigatorLocks: probeNavigatorLocks,
};

/** Worker probe timeout; a timeout is final (not retried) so boot stays bounded. */
const WORKER_PROBE_TIMEOUT_MS = 5_000;
/** Delay before the single retry of a failed (not timed-out) worker probe. */
const WORKER_RETRY_DELAY_MS = 250;

/** Cap on retry attempts for thrown (transient) probe errors. */
const MAX_PROBE_ATTEMPTS = 3;
/** Linear backoff base for retries. */
const PROBE_RETRY_DELAY_MS = 250;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function errorText(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return typeof error === 'string' ? error : 'probe failed';
}

/**
 * Runs one capability probe with transient-error retry.
 *
 * Thrown probe errors are retried with a short backoff: engines can reject
 * first-time storage initialization with transient errors. Probes returning
 * `false` or a structured failure are final — those mean the capability is
 * genuinely not supported. The whole boot check stays bounded: the worker
 * probe is never retried (a timeout is not transient).
 *
 * @returns The failure, or null when the probe passed.
 */
async function runCapabilityProbe(
  id: CapabilityId,
  probe: CapabilityProbes[CapabilityId],
): Promise<CapabilityFailure | null> {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= MAX_PROBE_ATTEMPTS; attempt += 1) {
    try {
      const result = await probe();
      if (result === false) {
        return { id, reason: 'unavailable' };
      }
      if (typeof result !== 'boolean') {
        return result;
      }
      return null;
    } catch (error) {
      lastError = error;
      if (attempt < MAX_PROBE_ATTEMPTS) {
        await delay(PROBE_RETRY_DELAY_MS * attempt);
      }
    }
  }
  return { id, reason: errorText(lastError).slice(0, 120) };
}

const CAPABILITY_ORDER: readonly CapabilityId[] = [
  'moduleWorkers',
  'webAssembly',
  'opfs',
  'syncAccessHandle',
  'cryptoSubtle',
  'navigatorLocks',
];

/**
 * Runs every capability probe, capturing the reason a probe failed for
 * diagnostics. Reasons come from the browser engine itself and never contain
 * user content.
 *
 * @param probes Override map for tests; unspecified capabilities use the real
 *   browser probes.
 * @returns A report with the list of failed capabilities; `ok` is true when
 *   every capability is available.
 * @example
 * const report = await checkCapabilities();
 * if (!report.ok) renderUnsupportedScreen(report.failures);
 */
export async function checkCapabilities(
  probes: Partial<CapabilityProbes> = {},
): Promise<CapabilityReport> {
  const merged: CapabilityProbes = { ...defaultProbes, ...probes };
  const failures: CapabilityFailure[] = [];
  for (const id of CAPABILITY_ORDER) {
    const failure = await runCapabilityProbe(id, merged[id]);
    if (failure !== null) {
      failures.push(failure);
    }
  }
  return { ok: failures.length === 0, failures };
}
