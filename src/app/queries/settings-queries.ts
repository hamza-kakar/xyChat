/**
 * Settings queries and mutations: app
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

/** App-lock state: PIN set, auto-lock delay, active lockout. */
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

/** Sets, changes or removes the PIN. */
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

/** Stores the auto-lock delay. */
export function useSetAutoLock() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (minutes: number) => dbClient.setAutoLock(minutes),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: queryKeys.lockState(), exact: true });
    },
  });
}

/** Media bytes per chat. */
export function useStorageUsage() {
  return useQuery({
    queryKey: queryKeys.storageUsage(),
    queryFn: () => dbClient.storageUsage(),
  });
}

/** The browser's usage and quota estimate. */
export function useStorageEstimate() {
  return useQuery({ queryKey: queryKeys.storageEstimate(), queryFn: () => estimateStorage() });
}

/** Whether the origin holds persistent storage. */
export function useStoragePersisted() {
  return useQuery({ queryKey: queryKeys.storagePersisted(), queryFn: () => isStoragePersisted() });
}

/** Asks for persistent storage ("Request"). */
export function useRequestPersistence() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => requestPersistentStorage(),
    onSuccess: (granted) => {
      client.setQueryData(queryKeys.storagePersisted(), granted);
    },
  });
}

/** Lists stored files that no attachment references (sweeper). */
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

/** Schema version of the open database (diagnostics). */
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

/** The capability report for Diagnostics. */
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

/** The bundled dependencies' licenses (About). */
export function useLicenses() {
  return useQuery({ queryKey: queryKeys.licenses(), queryFn: () => loadLicenses() });
}
