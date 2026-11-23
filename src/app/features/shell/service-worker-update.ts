/**
 * Service worker registration and the "update available" state. registerType is 'prompt': a new worker waits until the
 * user taps Reload, and nothing here reloads on its own.
 */
import { useSyncExternalStore } from 'react';
import type { RegisterSWOptions } from 'vite-plugin-pwa/types';

let isUpdateWaiting = false;
let activateWaitingWorker: ((reloadPage?: boolean) => Promise<void>) | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function readUpdateWaiting(): boolean {
  return isUpdateWaiting;
}

/** vite-plugin-pwa's `registerSW`, passed in by main.tsx so this module
 * does not import the build-only virtual module. */
export type RegisterServiceWorker = (
  options: RegisterSWOptions,
) => (reloadPage?: boolean) => Promise<void>;

/** Registers the service worker; a waiting update flips the store. */
export function registerServiceWorker(register: RegisterServiceWorker): void {
  activateWaitingWorker = register({
    immediate: true,
    onNeedRefresh() {
      isUpdateWaiting = true;
      for (const listener of listeners) {
        listener();
      }
    },
  });
}

/** Activates the waiting worker and reloads once it takes control. Only
 * called from the user's Reload tap. */
export function applyUpdate(): void {
  void activateWaitingWorker?.(true);
}

/** True once a new service worker is installed and waiting. */
export function useUpdateWaiting(): boolean {
  return useSyncExternalStore(subscribe, readUpdateWaiting, readUpdateWaiting);
}
