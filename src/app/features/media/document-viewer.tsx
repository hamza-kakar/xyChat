/**
 * Document viewer: type icon, name and size, and
 * hand-off to the OS — Open (a new tab, where iOS previews PDFs), Share
 * (the share sheet with the file) and Save (a download). Contents are
 * never rendered inside the app.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { en } from '../../i18n/en';
import { formatBytes } from '../../i18n/format-string';
import { DocumentIcon, OpenIcon, SaveIcon, ShareIcon } from '../../components/icons';
import { readStoredFile } from '../../../platform/media-url';
import type { AttachmentView } from '../../../client/db-client';

/** The stored file under its original name and MIME type (display and
 * hand-off only; OPFS stores it by attachment id). */
async function loadNamedFile(attachment: AttachmentView): Promise<File | null> {
  if (attachment.opfsPath === null) {
    return null;
  }
  const stored = await readStoredFile(attachment.opfsPath);
  if (stored === null) {
    return null;
  }
  const name = attachment.fileName ?? attachment.opfsPath.split('/').pop() ?? 'file';
  return new File([stored], name, { type: attachment.mime ?? 'application/octet-stream' });
}

/** How long an opened file's URL lives, so the new tab can load it. */
const OPEN_URL_LIFETIME_MS = 60_000;

function openFile(file: File): void {
  const url = URL.createObjectURL(file);
  window.open(url, '_blank', 'noopener');
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, OPEN_URL_LIFETIME_MS);
}

function saveFile(file: File): void {
  const url = URL.createObjectURL(file);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = file.name;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function shareFile(file: File): Promise<void> {
  await navigator.share({ files: [file] });
}

/** True when the platform can share this kind of file. */
function canShareFiles(): boolean {
  return typeof navigator.canShare === 'function' && typeof navigator.share === 'function';
}

function ActionButton({
  icon,
  label,
  disabled,
  onClick,
}: {
  readonly icon: ReactNode;
  readonly label: string;
  readonly disabled: boolean;
  readonly onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      className="flex min-h-11 min-w-24 flex-col items-center justify-center gap-1 rounded-xl bg-white/10 px-4 py-2 font-semibold text-white disabled:opacity-50"
      onClick={onClick}
    >
      {icon}
      {label}
    </button>
  );
}

/** Props for {@link DocumentViewer}. */
export interface DocumentViewerProps {
  readonly attachment: AttachmentView;
}

/** Loads the file when the viewer opens, so Open and Share run inside
 * the tap (popup blockers and the share sheet need the user gesture). */
function useNamedFile(attachment: AttachmentView): File | null | 'loading' {
  const [loaded, setLoaded] = useState<{ readonly id: string; readonly file: File | null } | null>(
    null,
  );
  useEffect(() => {
    let active = true;
    void loadNamedFile(attachment).then((file) => {
      if (active) {
        setLoaded({ id: attachment.id, file });
      }
    });
    return () => {
      active = false;
    };
  }, [attachment]);
  return loaded?.id === attachment.id ? loaded.file : 'loading';
}

export function DocumentViewer({ attachment }: DocumentViewerProps) {
  const file = useNamedFile(attachment);
  const busy = file === 'loading';
  const run = (action: (target: File) => Promise<void> | void): void => {
    if (file === null || file === 'loading') {
      return;
    }
    // A dismissed share sheet rejects; nothing to report.
    void Promise.resolve(action(file)).catch(() => undefined);
  };
  const label = attachment.fileName ?? en.chatView.mediaLabels[attachment.mediaType];
  return (
    <div className="flex flex-col items-center gap-4 p-6 text-center text-white">
      <DocumentIcon className="h-16 w-16" />
      <p className="max-w-full font-semibold break-words" dir="auto">
        {label}
      </p>
      {attachment.byteSize === null ? null : (
        <p className="text-sm text-white/80">{formatBytes(attachment.byteSize)}</p>
      )}
      {file === null ? (
        <p role="alert" className="text-sm">
          {en.media.documentFailed}
        </p>
      ) : (
        <div className="flex flex-wrap justify-center gap-2">
          <ActionButton
            icon={<OpenIcon className="h-6 w-6" />}
            label={en.media.documentOpen}
            disabled={busy}
            onClick={() => {
              run(openFile);
            }}
          />
          {canShareFiles() ? (
            <ActionButton
              icon={<ShareIcon className="h-6 w-6" />}
              label={en.media.documentShare}
              disabled={busy}
              onClick={() => {
                run(shareFile);
              }}
            />
          ) : null}
          <ActionButton
            icon={<SaveIcon className="h-6 w-6" />}
            label={en.media.documentSave}
            disabled={busy}
            onClick={() => {
              run(saveFile);
            }}
          />
        </div>
      )}
    </div>
  );
}
