/**
 * Settings → Make a backup: all chats or one, with or
 * without media; the estimated size first (with the 1 GB iPhone warning),
 * then progress with Cancel, then Share / Save.
 */
import { useId, useState } from 'react';
import { APP_NAME, APP_VERSION, BACKUP_LIMITS } from '../../../config';
import { en } from '../../../i18n/en';
import { formatBytes, formatCount, formatString } from '../../../i18n/format-string';
import { useChats } from '../../../queries/chat-queries';
import { useBackupEstimate, useCreateBackup } from '../../../queries/backup-queries';
import { BackupFileActions } from './backup-file-actions';
import { TransferProgressView } from './transfer-progress';
import { useTransfer } from './use-transfer';

function Estimate({ chatId, includeMedia }: { chatId: string | null; includeMedia: boolean }) {
  const estimate = useBackupEstimate(chatId, includeMedia);
  if (estimate.data === undefined) {
    return null;
  }
  return (
    <>
      <p className="text-text-muted text-sm">
        {formatString(en.backup.estimate, { size: formatBytes(estimate.data) })}
      </p>
      {estimate.data > BACKUP_LIMITS.largeBackupBytes ? (
        <p className="text-danger text-sm">{en.backup.largeWarning}</p>
      ) : null}
    </>
  );
}

function BackupOutcome({ create }: { create: ReturnType<typeof useCreateBackup> }) {
  if (create.isError) {
    return (
      <p role="alert" className="text-danger text-sm">
        {en.backup.errors.INTERNAL}
      </p>
    );
  }
  const outcome = create.data;
  if (outcome === undefined) {
    return null;
  }
  if (!outcome.ok) {
    return (
      <p role="alert" className="text-danger text-sm">
        {en.backup.errors[outcome.error.code]}
      </p>
    );
  }
  const { value } = outcome;
  return (
    <div className="flex flex-col gap-2">
      <p role="status" className="text-text">
        {formatString(en.backup.ready, {
          fileName: value.fileName,
          size: formatBytes(value.bytes),
        })}
      </p>
      {value.mediaMissing > 0 ? (
        <p className="text-text-muted text-sm">
          {formatCount(value.mediaMissing, en.backup.mediaMissing)}
        </p>
      ) : null}
      <BackupFileActions path={value.path} />
    </div>
  );
}

export function MakeBackup() {
  const chats = useChats();
  const create = useCreateBackup();
  const transfer = useTransfer();
  const [chatId, setChatId] = useState<string | null>(null);
  const [includeMedia, setIncludeMedia] = useState(true);
  const scopeId = useId();
  const mediaId = useId();
  const list = chats.data ?? [];
  if (chats.isPending) {
    return null;
  }
  if (list.length === 0) {
    return <p className="text-text-muted text-sm">{en.backup.noChats}</p>;
  }
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-text font-semibold">{en.backup.makeHeading}</h3>
      <label htmlFor={scopeId} className="text-text-muted text-sm">
        {en.backup.scopeLabel}
      </label>
      <select
        id={scopeId}
        value={chatId ?? ''}
        disabled={create.isPending}
        className="border-border bg-surface text-text min-h-11 rounded-lg border px-3"
        onChange={(event) => {
          setChatId(event.target.value === '' ? null : event.target.value);
        }}
      >
        <option value="">{en.backup.scopeAll}</option>
        {list.map((chat) => (
          <option key={chat.id} value={chat.id}>
            {chat.title}
          </option>
        ))}
      </select>
      <div className="flex min-h-11 items-center gap-3">
        <input
          id={mediaId}
          type="checkbox"
          checked={includeMedia}
          disabled={create.isPending}
          className="accent-accent size-5"
          onChange={(event) => {
            setIncludeMedia(event.target.checked);
          }}
        />
        <label htmlFor={mediaId} className="text-text">
          {en.backup.includeMedia}
        </label>
      </div>
      <Estimate chatId={chatId} includeMedia={includeMedia} />
      {create.isPending ? (
        <TransferProgressView transfer={transfer} firstPhase="snapshot" canCancel />
      ) : (
        <button
          type="button"
          className="bg-accent text-accent-contrast min-h-11 rounded-lg px-4 font-semibold"
          onClick={() => {
            transfer.reset();
            create.mutate({
              chatId,
              includeMedia,
              appName: APP_NAME,
              appVersion: APP_VERSION,
              callbacks: transfer.callbacks,
            });
          }}
        >
          {en.backup.make}
        </button>
      )}
      {create.isPending ? null : <BackupOutcome create={create} />}
    </div>
  );
}
