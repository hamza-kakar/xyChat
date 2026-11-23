/**
 * Contact card: the name from the stored `.vcf` (parsed
 * in db.worker, size-capped), plus Share or Save for the card itself.
 */
import { useState } from 'react';
import { en } from '../../i18n/en';
import { readStoredFile } from '../../../platform/media-url';
import { ContactIcon, ShareIcon } from '../../components/icons';
import { useContactName } from '../../queries/message-queries';
import type { AttachmentView } from '../../../client/db-client';

/** Shares the card through the OS sheet, or saves it as a download. */
async function shareOrSave(file: File): Promise<void> {
  if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    await navigator.share({ files: [file] });
    return;
  }
  const url = URL.createObjectURL(file);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = file.name;
  anchor.click();
  URL.revokeObjectURL(url);
}

/** Props for {@link ContactCard}. */
export interface ContactCardProps {
  readonly messageRowId: number;
  readonly attachment: AttachmentView | undefined;
}

export function ContactCard({ messageRowId, attachment }: ContactCardProps) {
  const path = attachment?.status === 'present' ? attachment.opfsPath : null;
  const name = useContactName(messageRowId, path !== null);
  const [busy, setBusy] = useState(false);
  const canShare = typeof navigator.share === 'function';
  return (
    <div className="flex items-center gap-3 py-1">
      <ContactIcon className="h-8 w-8 shrink-0" />
      <span className="min-w-0 flex-1 truncate font-semibold" dir="auto">
        {name.data ?? attachment?.fileName ?? en.chatView.contactUnknown}
      </span>
      {path === null ? null : (
        <button
          type="button"
          disabled={busy}
          className="text-link-on-bubble flex min-h-11 items-center gap-1 rounded-lg px-2 text-sm font-semibold disabled:opacity-60"
          onClick={() => {
            setBusy(true);
            void readStoredFile(path)
              .then(async (stored) => {
                if (stored !== null) {
                  const fileName = attachment?.fileName ?? 'contact.vcf';
                  await shareOrSave(new File([stored], fileName, { type: 'text/vcard' }));
                }
              })
              // A dismissed share sheet rejects; nothing to report.
              .catch(() => undefined)
              .finally(() => {
                setBusy(false);
              });
          }}
        >
          <ShareIcon className="h-4 w-4" />
          {canShare ? en.chatView.contactShare : en.chatView.contactDownload}
        </button>
      )}
    </div>
  );
}
