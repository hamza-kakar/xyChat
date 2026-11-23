/**
 * Chat info: import history (§12.7) — when, which file, how many messages
 * were added or already there, the parser version and a warnings summary.
 * Import times are app bookkeeping instants (not chat timestamps), shown
 * in the device's time zone.
 */
import { en } from '../../i18n/en';
import { formatCount, formatString } from '../../i18n/format-string';
import { SettingsSection } from '../../components/settings-section';
import { useImports } from '../../queries/chat-queries';
import type { ImportRecordView } from '../../../client/db-client';
import type { ChatId } from '../../../core/ids';

/** Props for {@link ImportHistory}. */
export interface ImportHistoryProps {
  readonly chatId: ChatId;
}

function warningCount(record: ImportRecordView): number {
  return Object.values(record.report?.warningsByCode ?? {}).reduce((sum, n) => sum + n, 0);
}

function ImportItem({ record }: { readonly record: ImportRecordView }) {
  const when = new Intl.DateTimeFormat(navigator.language, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(record.startedAt));
  const warnings = warningCount(record);
  return (
    <li className="flex flex-col gap-0.5 py-2 text-sm">
      <span className="text-text break-all" dir="auto">
        {formatString(en.chatInfo.importLine, { date: when, file: record.fileName })}
      </span>
      <span className="text-text-muted">
        {record.report === null
          ? `${en.chatInfo.statusLabels[record.status]} · ${en.chatInfo.importNoDetails}`
          : formatString(en.chatInfo.importCounts, {
              added: record.report.messagesAdded.toLocaleString(),
              duplicates: record.report.duplicatesSkipped.toLocaleString(),
            })}
      </span>
      <span className="text-text-muted">
        {formatString(en.chatInfo.importParser, { version: record.parserVersion })}
        {' · '}
        {warnings === 0
          ? en.chatInfo.importNoWarnings
          : formatCount(warnings, en.chatInfo.importWarnings)}
      </span>
    </li>
  );
}

export function ImportHistory({ chatId }: ImportHistoryProps) {
  const imports = useImports(chatId, true);
  if (imports.data === undefined || imports.data.length === 0) {
    return null;
  }
  return (
    <SettingsSection heading={en.chatInfo.importsHeading}>
      <ul className="divide-border flex flex-col divide-y">
        {imports.data.map((record) => (
          <ImportItem key={record.id} record={record} />
        ))}
      </ul>
    </SettingsSection>
  );
}
