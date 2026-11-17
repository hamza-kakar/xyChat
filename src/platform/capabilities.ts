/**
 * Browser capability detection (AGENTS.md §12.11). Every check must pass
 * before the app renders; a failure produces a full-screen explanation,
 * never a blank page.
 */

export type CapabilityId =
  'moduleWorkers' | 'webAssembly' | 'opfs' | 'syncAccessHandle' | 'cryptoSubtle' | 'navigatorLocks';

export interface CapabilityFailure {
  readonly id: CapabilityId;
  /** Browser-provided error text, or 'unavailable' when the probe is false. */
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

interface ProbeOutcome {
  readonly moduleWorkers: boolean;
  readonly syncAccessHandle: boolean;
  readonly syncAccessHandleReason: string;
}

/** Spawns a module worker from a blob URL; resolves null if it cannot run. */
async function probeWorker(): Promise<WorkerReply | null> {
  const blob = new Blob([PROBE_WORKER_SOURCE], { type: 'text/javascript' });
  const url = URL.createObjectURL(blob);
  try {
    const worker = new Worker(url, { type: 'module' });
    const outcome = await new Promise<WorkerReply | null>((resolve) => {
      const timer = setTimeout(() => {
        resolve(null);
      }, 10_000);
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

async function probeStorage(): Promise<ProbeOutcome> {
  const reply = await probeWorker();
  if (reply === null) {
    // The worker could not be constructed or never answered: both probes fail.
    return {
      moduleWorkers: false,
      syncAccessHandle: false,
      syncAccessHandleReason: 'worker did not respond within 10s',
    };
  }
  // A reply proves a module worker constructed, started and posted a message;
  // its payload reports the OPFS sync-access-handle dance.
  return {
    moduleWorkers: true,
    syncAccessHandle: reply.ok,
    syncAccessHandleReason: reply.error,
  };
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

/** The real browser probes, exposed for tests to substitute. */
export const defaultProbes: CapabilityProbes = {
  moduleWorkers: async () => (await probeStorage()).moduleWorkers,
  webAssembly: probeWebAssembly,
  // Errors are deliberately NOT caught here: storage init can fail
  // transiently (UnknownError under memory pressure), and the retry in
  // checkCapabilities absorbs that. A genuine absence rethrows every time.
  opfs: async () => {
    await navigator.storage.getDirectory();
    return true;
  },
  syncAccessHandle: async () => {
    const outcome = await probeStorage();
    if (outcome.syncAccessHandle) {
      return true;
    }
    throw new Error(outcome.syncAccessHandleReason || 'sync access handle unavailable');
  },
  cryptoSubtle: probeCryptoSubtle,
  navigatorLocks: probeNavigatorLocks,
};

const MAX_PROBE_ATTEMPTS = 3;
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
/**
 * Runs one capability probe with transient-error retry.
 *
 * Thrown probe errors are retried with a short backoff: browsers (notably
 * under device memory pressure) can reject first-time storage initialization
 * with transient errors, and a retry distinguishes that from real absence.
 * Probes that return `false` or a structured failure are final — those mean
 * the capability is genuinely not supported, not a transient hiccup.
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

/**
 * Runs every capability probe, capturing the reason a probe failed so the
 * unsupported screen (and e2e diagnostics) can show it. Reasons come from
 * the browser engine itself and never contain user content.
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
  const merged = { ...defaultProbes, ...probes };
  const ids: readonly CapabilityId[] = [
    'moduleWorkers',
    'webAssembly',
    'opfs',
    'syncAccessHandle',
    'cryptoSubtle',
    'navigatorLocks',
  ];
  const failures: CapabilityFailure[] = [];
  for (const id of ids) {
    const failure = await runCapabilityProbe(id, merged[id]);
    if (failure !== null) {
      failures.push(failure);
    }
  }
  return { ok: failures.length === 0, failures };
}
