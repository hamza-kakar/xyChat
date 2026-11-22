/**
 * Message actions (AGENTS.md §12.5): copy text, share text and message
 * info (time with seconds, sender, kind, and the import that stored it).
 */
import { useState } from 'react';
import { formatDateTime } from '../../../core/dates';
import type { ChatId } from '../../../core/ids';
import { en } from '../../i18n/en';
import { formatString } from '../../i18n/format-string';
import { Sheet, SheetButton } from '../../components/sheet';
import { useImports } from '../../queries/chat-queries';
import type { WindowMessage } from '../../../client/db-client';

/** Props for {@link MessageActionsSheet}. */
export interface MessageActionsSheetProps {
  readonly chatId: ChatId;
  readonly message: WindowMessage;
  readonly locale: string;
  readonly onClose: () => void;
}

/** Text worth copying or sharing; deleted and empty messages have none. */
function copyableText(message: WindowMessage): string | null {
  return message.kind === 'deleted' || message.body === '' ? null : message.body;
}

export function MessageActionsSheet(props: MessageActionsSheetProps) {
  const { message, onClose } = props;
  const [mode, setMode] = useState<'menu' | 'info'>('menu');
  const [copied, setCopied] = useState(false);
  const text = copyableText(message);
  const canShare = typeof navigator.share === 'function';
  if (mode === 'info') {
    return <MessageInfoSheet {...props} />;
  }
  return (
    <Sheet open title={en.chatView.actionsTitle} closeLabel={en.chatView.close} onClose={onClose}>
      {text === null ? null : (
        <SheetButton
          onClick={() => {
            void navigator.clipboard.writeText(text).then(() => {
              setCopied(true);
            });
          }}
        >
          {copied ? en.chatView.actionCopied : en.chatView.actionCopy}
        </SheetButton>
      )}
      {text === null || !canShare ? null : (
        <SheetButton
          onClick={() => {
            // A dismissed share sheet rejects; that is not an error.
            void navigator.share({ text }).catch(() => undefined);
          }}
        >
          {en.chatView.actionShare}
        </SheetButton>
      )}
      <SheetButton
        onClick={() => {
          setMode('info');
        }}
      >
        {en.chatView.actionInfo}
      </SheetButton>
    </Sheet>
  );
}

function MessageInfoSheet({ chatId, message, locale, onClose }: MessageActionsSheetProps) {
  const imports = useImports(chatId, true);
  const record = imports.data?.find((item) => item.id === message.importId);
  const importDate =
    record === undefined
      ? null
      : new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(
          new Date(record.startedAt),
        );
  const rows: readonly (readonly [string, string])[] = [
    [en.chatView.infoSent, formatDateTime(message.tsLocal, { locale })],
    [en.chatView.infoSender, message.authorName ?? en.chatView.systemSender],
    [en.chatView.infoKind, en.chatView.kindLabels[message.kind]],
    ...(record === undefined || importDate === null
      ? []
      : [
          [
            en.chatView.infoImport,
            formatString(en.chatView.infoImportValue, { file: record.fileName, date: importDate }),
          ] as const,
        ]),
  ];
  return (
    <Sheet open title={en.chatView.infoTitle} closeLabel={en.chatView.close} onClose={onClose}>
      <dl className="flex flex-col gap-2 pb-2">
        {rows.map(([label, value]) => (
          <div key={label} className="flex flex-col">
            <dt className="text-text-muted text-sm">{label}</dt>
            <dd className="text-text" dir="auto">
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </Sheet>
  );
}
