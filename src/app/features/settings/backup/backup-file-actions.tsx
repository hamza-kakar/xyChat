/**
 * Offers a finished backup (AGENTS.md §10.6): the share sheet when the
 * browser can share files, and a download otherwise (or as well).
 */
import { useState } from 'react';
import { en } from '../../../i18n/en';
import { canShareFile, downloadFile, shareFile } from '../../../../platform/share-file';
import { useBackupFile } from '../../../queries/backup-queries';

/** Props for {@link BackupFileActions}. */
export interface BackupFileActionsProps {
  /** OPFS path of the archive. */
  readonly path: string;
}

export function BackupFileActions({ path }: BackupFileActionsProps) {
  const file = useBackupFile(path);
  const [sharing, setSharing] = useState(false);
  const archive = file.data ?? null;
  if (archive === null) {
    return null;
  }
  return (
    <div className="flex flex-wrap gap-2">
      {canShareFile(archive) ? (
        <button
          type="button"
          disabled={sharing}
          className="bg-accent text-accent-contrast min-h-11 rounded-lg px-4 font-semibold disabled:opacity-60"
          onClick={() => {
            setSharing(true);
            void shareFile(archive).finally(() => {
              setSharing(false);
            });
          }}
        >
          {en.backup.share}
        </button>
      ) : null}
      <button
        type="button"
        className="border-border text-text min-h-11 rounded-lg border px-4 font-semibold"
        onClick={() => {
          downloadFile(archive);
        }}
      >
        {en.backup.save}
      </button>
    </div>
  );
}
