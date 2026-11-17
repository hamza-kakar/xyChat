/**
 * Browser capability detection (AGENTS.md §12.11). Every check must pass
 * before the app renders; a failure produces a full-screen explanation,
 * never a blank page.
 */

export type CapabilityId =
  'moduleWorkers' | 'webAssembly' | 'opfs' | 'syncAccessHandle' | 'cryptoSubtle' | 'navigatorLocks';

export interface CapabilityReport {
  readonly ok: boolean;
  readonly failures: readonly CapabilityId[];
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
    self.postMessage('ok');
  } catch {
    self.postMessage('fail');
  }
};
`;

interface ProbeOutcome {
  readonly moduleWorkers: boolean;
  readonly syncAccessHandle: boolean;
}

/** Spawns a module worker from a blob URL; resolves null if it cannot run. */
async function probeWorker(): Promise<boolean | null> {
  const blob = new Blob([PROBE_WORKER_SOURCE], { type: 'text/javascript' });
  const url = URL.createObjectURL(blob);
  try {
    const worker = new Worker(url, { type: 'module' });
    const outcome = await new Promise<boolean | null>((resolve) => {
      const timer = setTimeout(() => {
        resolve(null);
      }, 5_000);
      worker.onmessage = (event: MessageEvent<unknown>) => {
        clearTimeout(timer);
        resolve(event.data === 'ok');
      };
      worker.onerror = () => {
        clearTimeout(timer);
        resolve(null);
      };
      worker.postMessage('probe');
    });
    worker.terminate();
    return outcome;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function probeStorage(): Promise<ProbeOutcome> {
  const workerOutcome = await probeWorker();
  if (workerOutcome === null) {
    // The worker could not be constructed or never answered: both probes fail.
    return { moduleWorkers: false, syncAccessHandle: false };
  }
  // A boolean answer proves a module worker constructed, started and posted a
  // message; the value itself reports the OPFS sync-access-handle dance.
  return { moduleWorkers: true, syncAccessHandle: workerOutcome };
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

async function probeOpfs(): Promise<boolean> {
  try {
    await navigator.storage.getDirectory();
    return true;
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

export type CapabilityProbes = Readonly<Record<CapabilityId, () => boolean | Promise<boolean>>>;

/** The real browser probes, exposed for tests to substitute. */
export const defaultProbes: CapabilityProbes = {
  moduleWorkers: async () => (await probeStorage()).moduleWorkers,
  webAssembly: probeWebAssembly,
  opfs: probeOpfs,
  syncAccessHandle: async () => (await probeStorage()).syncAccessHandle,
  cryptoSubtle: probeCryptoSubtle,
  navigatorLocks: probeNavigatorLocks,
};

/**
 * Runs every capability probe.
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
  const failures: CapabilityId[] = [];
  for (const id of ids) {
    const probe = merged[id];
    const available = await probe();
    if (!available) {
      failures.push(id);
    }
  }
  return { ok: failures.length === 0, failures };
}
