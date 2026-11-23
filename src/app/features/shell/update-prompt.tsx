/**
 * The "Update available" toast (AGENTS.md §12.12). It appears once a new
 * service worker waits, stays hidden while an import, backup or restore
 * runs, and reloads only when the user taps Reload.
 */
import { useState } from 'react';
import { en } from '../../i18n/en';
import { useIsLongTaskRunning } from '../../hooks/use-long-task';
import { applyUpdate, useUpdateWaiting } from './service-worker-update';

export function UpdatePrompt() {
  const isUpdateWaiting = useUpdateWaiting();
  const isTaskRunning = useIsLongTaskRunning();
  const [dismissed, setDismissed] = useState(false);
  const visible = isUpdateWaiting && !isTaskRunning && !dismissed;
  return (
    <div className="safe-sides-bottom pointer-events-none fixed inset-x-0 bottom-0 z-40">
      <div role="status" className="flex justify-center p-3">
        {visible ? (
          <div className="bg-surface-raised border-border text-text pointer-events-auto flex items-center gap-2 rounded-xl border py-1 ps-4 pe-1 shadow-lg">
            <p className="text-sm">{en.update.available}</p>
            <button
              type="button"
              className="text-text-muted min-h-11 px-3 text-sm"
              onClick={() => {
                setDismissed(true);
              }}
            >
              {en.update.later}
            </button>
            <button
              type="button"
              className="bg-accent text-accent-contrast min-h-11 rounded-lg px-4 text-sm font-semibold"
              onClick={applyUpdate}
            >
              {en.update.reload}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
