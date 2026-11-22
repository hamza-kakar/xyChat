/**
 * Persistent storage (AGENTS.md §12.9, §22 M3): requests durable storage
 * after the first successful import. Pure platform wrapper (§3.1).
 */

/** True when the origin already holds persistent storage. */
export async function isStoragePersisted(): Promise<boolean> {
  try {
    return await navigator.storage.persisted();
  } catch {
    return false;
  }
}

/** Requests persistent storage; false when denied or unsupported (§0.6:
 * the import still completes — eviction risk is surfaced in Settings, M7). */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

/** Bytes used and available to this origin (§12.9). */
export interface StorageEstimateBytes {
  readonly usage: number;
  readonly quota: number;
}

/** The browser's storage estimate; null when unavailable. */
export async function estimateStorage(): Promise<StorageEstimateBytes | null> {
  try {
    const estimate = await navigator.storage.estimate();
    return { usage: estimate.usage ?? 0, quota: estimate.quota ?? 0 };
  } catch {
    return null;
  }
}
