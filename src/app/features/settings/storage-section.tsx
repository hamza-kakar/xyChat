/**
 * Settings → Storage (AGENTS.md §12.9): used/quota, media per chat,
 * persistent storage status with a Request button, and the orphan-file
 * clean-up (§9.3) behind a confirmation.
 */
import { useMemo, useState } from 'react';
import { APP_NAME } from '../../config';
import { en } from '../../i18n/en';
import { formatBytes, formatString } from '../../i18n/format-string';
import { Sheet, SheetButton } from '../../components/sheet';
import { SettingsSection } from '../../components/settings-section';
import { useChats } from '../../queries/chat-queries';
import {
  useDeleteOrphanMedia,
  useFindOrphanMedia,
  useRequestPersistence,
  useStorageEstimate,
  useStoragePersisted,
  useStorageUsage,
} from '../../queries/settings-queries';

function UsageSummary() {
  const estimate = useStorageEstimate();
  if (estimate.isPending) {
    return null;
  }
  if (estimate.data === null || estimate.data === undefined) {
    return <p className="text-text-muted text-sm">{en.settings.storage.usageUnavailable}</p>;
  }
  return (
    <p className="text-text">
      {formatString(en.settings.storage.usage, {
        used: formatBytes(estimate.data.usage),
        quota: formatBytes(estimate.data.quota),
        appName: APP_NAME,
      })}
    </p>
  );
}

function Persistence() {
  const persisted = useStoragePersisted();
  const request = useRequestPersistence();
  if (persisted.data === undefined) {
    return null;
  }
  if (persisted.data) {
    return <p className="text-text-muted text-sm">{en.settings.storage.persisted}</p>;
  }
  return (
    <>
      <p className="text-text-muted text-sm">{en.settings.storage.notPersisted}</p>
      <button
        type="button"
        disabled={request.isPending}
        className="border-border text-text min-h-11 rounded-lg border px-4 text-start font-semibold disabled:opacity-60"
        onClick={() => {
          request.mutate();
        }}
      >
        {en.settings.storage.requestPersist}
      </button>
      {request.data === false ? (
        <p role="status" className="text-text-muted text-sm">
          {en.settings.storage.persistDenied}
        </p>
      ) : null}
    </>
  );
}

function PerChatUsage() {
  const chats = useChats();
  const usage = useStorageUsage();
  const rows = useMemo(() => {
    const bytes = new Map(
      (usage.data?.perChat ?? []).map((row) => [row.chatId as string, row.bytes]),
    );
    return (chats.data ?? [])
      .map((chat) => ({ id: chat.id, title: chat.title, bytes: bytes.get(chat.id) ?? 0 }))
      .filter((row) => row.bytes > 0)
      .sort((a, b) => b.bytes - a.bytes);
  }, [chats.data, usage.data]);
  if (chats.isPending || usage.isPending) {
    return null;
  }
  return (
    <div className="flex flex-col gap-1">
      <h3 className="text-text-muted text-sm">{en.settings.storage.perChatHeading}</h3>
      {rows.length === 0 ? (
        <p className="text-text-muted text-sm">{en.settings.storage.perChatEmpty}</p>
      ) : (
        <ul className="divide-border flex flex-col divide-y">
          {rows.map((row) => (
            <li key={row.id} className="flex min-h-11 items-center justify-between gap-3">
              <span className="text-text truncate" dir="auto">
                {row.title}
              </span>
              <span className="text-text-muted shrink-0 text-sm">{formatBytes(row.bytes)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function OrphanCleanup() {
  const find = useFindOrphanMedia();
  const remove = useDeleteOrphanMedia();
  const [confirming, setConfirming] = useState<readonly string[] | null>(null);
  let status: string | null = null;
  if (find.isPending) {
    status = en.settings.storage.cleanUpChecking;
  } else if (find.isError || remove.isError) {
    status = en.settings.storage.failed;
  } else if (remove.data !== undefined) {
    status = formatString(en.settings.storage.cleanUpDone, { count: remove.data });
  } else if (find.data?.length === 0) {
    status = en.settings.storage.cleanUpNone;
  }
  return (
    <>
      <button
        type="button"
        disabled={find.isPending || remove.isPending}
        className="border-border text-text min-h-11 rounded-lg border px-4 text-start font-semibold disabled:opacity-60"
        onClick={() => {
          remove.reset();
          find.mutate(undefined, {
            onSuccess: (paths) => {
              if (paths.length > 0) {
                setConfirming(paths);
              }
            },
          });
        }}
      >
        {en.settings.storage.cleanUp}
      </button>
      {status === null ? null : (
        <p role="status" className="text-text-muted text-sm">
          {status}
        </p>
      )}
      <Sheet
        open={confirming !== null}
        title={en.settings.storage.cleanUpTitle}
        closeLabel={en.settings.storage.close}
        onClose={() => {
          setConfirming(null);
        }}
      >
        <p className="text-text-muted text-sm">
          {formatString(en.settings.storage.cleanUpBody, { count: confirming?.length ?? 0 })}
        </p>
        <button
          type="button"
          disabled={remove.isPending}
          className="bg-danger text-danger-contrast min-h-11 rounded-lg px-4 font-semibold disabled:opacity-60"
          onClick={() => {
            if (confirming !== null) {
              remove.mutate(confirming, {
                onSettled: () => {
                  setConfirming(null);
                },
              });
            }
          }}
        >
          {en.settings.storage.cleanUpConfirm}
        </button>
        <SheetButton
          onClick={() => {
            setConfirming(null);
          }}
        >
          {en.settings.storage.cancel}
        </SheetButton>
      </Sheet>
    </>
  );
}

export function StorageSection() {
  return (
    <SettingsSection heading={en.settings.storage.heading} id="storage">
      <UsageSummary />
      <Persistence />
      <PerChatUsage />
      <OrphanCleanup />
    </SettingsSection>
  );
}
