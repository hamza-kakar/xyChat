/**
 * Settings queries and mutations (AGENTS.md §12.9, §15.3, §18.4): app
 * lock, storage, diagnostics and the license list.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { dbClient } from '../../client/db-client';
import { CAPABILITY_ORDER, checkCapabilities } from '../../platform/capabilities';
import {
  estimateStorage,
  isStoragePersisted,
  requestPersistentStorage,
} from '../../platform/persistence';
import { loadLicenses } from './licenses';
import { queryKeys } from './keys';

/** App-lock state: PIN set, auto-lock delay, active lockout (§15.3). */
export function useLockState() {
  return useQuery({ queryKey: queryKeys.lockState(), queryFn: () => dbClient.getLockState() });
}

/** Checks a PIN on the lock screen; refreshes the lockout afterwards. */
export function useVerifyPin() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (pin: string) => dbClient.verifyPin(pin),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: queryKeys.lockState(), exact: true });
    },
  });
}

/** Sets, changes or removes the PIN (§15.3). */
export function useChangePin() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { readonly current: string | null; readonly next: string | null }) =>
      dbClient.changePin({ current: input.current, next: input.next }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: queryKeys.lockState(), exact: true });
    },
  });
}

/** Stores the auto-lock delay (§15.3). */
export function useSetAutoLock() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (minutes: number) => dbClient.setAutoLock(minutes),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: queryKeys.lockState(), exact: true });
    },
  });
}

/** Media bytes per chat (§12.9). */
export function useStorageUsage() {
  return useQuery({
    queryKey: queryKeys.storageUsage(),
    queryFn: () => dbClient.storageUsage(),
  });
}

/** The browser's usage and quota estimate (§12.9). */
export function useStorageEstimate() {
  return useQuery({ queryKey: queryKeys.storageEstimate(), queryFn: () => estimateStorage() });
}

/** Whether the origin holds persistent storage (§12.9). */
export function useStoragePersisted() {
  return useQuery({ queryKey: queryKeys.storagePersisted(), queryFn: () => isStoragePersisted() });
}

/** Asks for persistent storage (§12.9 "Request"). */
export function useRequestPersistence() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => requestPersistentStorage(),
    onSuccess: (granted) => {
      client.setQueryData(queryKeys.storagePersisted(), granted);
    },
  });
}

/** Lists stored files that no attachment references (§9.3 sweeper). */
export function useFindOrphanMedia() {
  return useMutation({ mutationFn: () => dbClient.listOrphanMedia() });
}

/** Deletes the confirmed orphan files; resolves to the count removed. */
export function useDeleteOrphanMedia() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (paths: readonly string[]) => dbClient.deleteOrphanMedia(paths),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: queryKeys.storageEstimate(), exact: true });
    },
  });
}

/** Schema version of the open database (§12.9 diagnostics). */
export function useSchemaVersion() {
  return useQuery({
    queryKey: queryKeys.schemaVersion(),
    queryFn: () => dbClient.getSchemaVersion(),
  });
}

/** One row of the capability report: FTS5 passed when the database
 * booted, the rest are probed again. */
export interface CapabilityStatus {
  readonly id: (typeof CAPABILITY_ORDER)[number];
  readonly ok: boolean;
}

/** The capability report for Diagnostics (§12.9, §12.11). */
export function useCapabilityReport() {
  return useQuery({
    queryKey: queryKeys.capabilities(),
    queryFn: async (): Promise<readonly CapabilityStatus[]> => {
      const report = await checkCapabilities();
      const failed = new Set(report.failures.map((failure) => failure.id));
      return [
        ...CAPABILITY_ORDER.map((id) => ({ id, ok: !failed.has(id) })),
        // The app only renders after db.worker verified FTS5 (ADR 0008).
        { id: 'fts5' as const, ok: true },
      ];
    },
  });
}

/** The bundled dependencies' licenses (§12.9 About). */
export function useLicenses() {
  return useQuery({ queryKey: queryKeys.licenses(), queryFn: () => loadLicenses() });
}
