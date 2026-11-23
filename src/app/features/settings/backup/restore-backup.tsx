/**
 * Settings → Restore from a backup: pick a backup, see
 * its chats, choose per chat (restore / merge / replace / skip), then
 * progress with Cancel and a report with links to the restored chats.
 */
import { useId, useState } from 'react';
import { Link } from 'react-router';
import { APP_NAME } from '../../../config';
import { en } from '../../../i18n/en';
import { formatCount, formatString } from '../../../i18n/format-string';
import { useInspectBackup, useRestoreBackup } from '../../../queries/backup-queries';
import type { RestoreOutcome } from '../../../../client/db-client';
import { RestoreChoices } from './restore-choices';
import { defaultChoices, toDecisions, type ChoiceMap } from './restore-decisions';
import { TransferProgressView } from './transfer-progress';
import { useTransfer } from './use-transfer';
import { useHoldLongTask } from '../../../hooks/use-long-task';

function errorText(code: keyof typeof en.backup.restoreErrors): string {
  return formatString(en.backup.restoreErrors[code], { appName: APP_NAME });
}

function RestoreReport({ outcome }: { readonly outcome: RestoreOutcome }) {
  if (!outcome.ok) {
    return (
      <p role="alert" className="text-danger text-sm">
        {errorText(outcome.error.code)}
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <p role="status" className="text-text">
        {formatCount(outcome.value.length, en.backup.restored)}
      </p>
      <ul className="divide-border flex flex-col divide-y">
        {outcome.value.map((chat) => (
          <li key={chat.chatId} className="flex flex-col gap-1 py-2 text-sm">
            <span className="text-text" dir="auto">
              {formatString(en.backup.reportLine, {
                title: chat.title,
                added: chat.messagesAdded.toLocaleString(),
                duplicates: chat.duplicatesSkipped.toLocaleString(),
              })}
            </span>
            <span className="text-text-muted">
              {formatCount(chat.mediaRestored, en.backup.reportMedia)}
              {chat.mediaMissing > 0
                ? ` · ${formatCount(chat.mediaMissing, en.backup.reportMissing)}`
                : ''}
            </span>
            <Link
              to={`/chat/${encodeURIComponent(chat.chatId)}`}
              className="text-accent flex min-h-11 items-center font-semibold"
            >
              {en.backup.openChat}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function RestoreBackup() {
  const inspect = useInspectBackup();
  const restore = useRestoreBackup();
  const transfer = useTransfer();
  const [file, setFile] = useState<File | null>(null);
  const [choices, setChoices] = useState<ChoiceMap>(new Map());
  const inputId = useId();
  const preview = inspect.data?.ok === true ? inspect.data.value : null;
  const busy = inspect.isPending || restore.isPending;
  const failed = inspect.isError || restore.isError;
  // Reading the backup and choosing are steps of the restore; the restore
  // call itself is tracked until it settles (useRestoreBackup).
  const awaitingChoices = preview !== null && restore.data === undefined;
  useHoldLongTask(inspect.isPending || awaitingChoices);

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-text font-semibold">{en.backup.restoreHeading}</h3>
      <label
        htmlFor={inputId}
        className="border-border text-text has-focus-visible:outline-focus-ring flex min-h-11 cursor-pointer items-center rounded-lg border px-4 font-semibold has-focus-visible:outline-2 has-disabled:opacity-60"
      >
        {file === null ? en.backup.chooseFile : en.backup.chooseAnother}
        <input
          id={inputId}
          type="file"
          accept=".zip,application/zip"
          disabled={busy}
          className="sr-only"
          onChange={(event) => {
            const picked = event.target.files?.[0] ?? null;
            event.target.value = '';
            if (picked === null) {
              return;
            }
            setFile(picked);
            restore.reset();
            inspect.mutate(picked, {
              onSuccess: (result) => {
                setChoices(result.ok ? defaultChoices(result.value.chats) : new Map());
              },
            });
          }}
        />
      </label>
      {inspect.isPending ? (
        <p role="status" className="text-text-muted text-sm">
          {en.backup.inspecting}
        </p>
      ) : null}
      {inspect.data?.ok === false ? (
        <p role="alert" className="text-danger text-sm">
          {errorText(inspect.data.error.code)}
        </p>
      ) : null}
      {failed ? (
        <p role="alert" className="text-danger text-sm">
          {errorText('INTERNAL')}
        </p>
      ) : null}
      {preview !== null && file !== null && restore.data === undefined && !restore.isPending ? (
        <RestoreChoices
          preview={preview}
          choices={choices}
          onChange={setChoices}
          onRestore={() => {
            transfer.reset();
            restore.mutate({
              file,
              decisions: toDecisions(preview.chats, choices),
              callbacks: transfer.callbacks,
            });
          }}
        />
      ) : null}
      {restore.isPending ? (
        <TransferProgressView
          transfer={transfer}
          firstPhase="reading"
          canCancel={transfer.progress?.phase !== 'committing'}
        />
      ) : null}
      {restore.data === undefined ? null : <RestoreReport outcome={restore.data} />}
    </div>
  );
}
