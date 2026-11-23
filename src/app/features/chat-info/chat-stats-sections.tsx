/**
 * Chat info: the overview (group or one-to-one, date range, total), the
 * totals by message kind, and the media counts and bytes. The
 * date range is formatted from the stored wall-clock times.
 */
import { Link } from 'react-router';
import { formatDate } from '../../../core/dates';
import type { MediaType, MessageKind } from '../../../core/model';
import { en } from '../../i18n/en';
import { formatBytes, formatCount, formatString } from '../../i18n/format-string';
import { SettingsSection } from '../../components/settings-section';
import { useChatStats } from '../../queries/chat-queries';
import type { ChatStatsView, ChatView } from '../../../client/db-client';

/** Props for {@link ChatStatsSections}. */
export interface ChatStatsSectionsProps {
  readonly chat: ChatView;
}

function countRows<K extends string>(
  counts: Readonly<Partial<Record<K, number>>>,
  labels: Readonly<Record<K, string>>,
): readonly { readonly key: K; readonly label: string; readonly count: number }[] {
  return (Object.keys(labels) as K[])
    .map((key) => ({ key, label: labels[key], count: counts[key] ?? 0 }))
    .filter((row) => row.count > 0);
}

function CountList({
  rows,
}: {
  readonly rows: readonly {
    readonly key: string;
    readonly label: string;
    readonly count: number;
  }[];
}) {
  return (
    <ul className="flex flex-col gap-1 text-sm">
      {rows.map((row) => (
        <li key={row.key} className="flex justify-between gap-3">
          <span className="text-text">{row.label}</span>
          <span className="text-text-muted">{row.count.toLocaleString()}</span>
        </li>
      ))}
    </ul>
  );
}

function dateRangeText(stats: ChatStatsView): string {
  if (stats.dateRange === null) {
    return en.chatInfo.noMessages;
  }
  const locale = navigator.language;
  return formatString(en.chatInfo.dateRange, {
    first: formatDate(stats.dateRange.first, { locale }),
    last: formatDate(stats.dateRange.last, { locale }),
  });
}

export function ChatStatsSections({ chat }: ChatStatsSectionsProps) {
  const stats = useChatStats(chat.id);
  if (stats.isPending) {
    return <p className="text-text-muted px-4 py-5">{en.chatInfo.loading}</p>;
  }
  if (stats.isError) {
    return (
      <p role="alert" className="text-text-muted px-4 py-5">
        {en.chatInfo.failed}
      </p>
    );
  }
  const kinds = countRows<MessageKind>(stats.data.totalsByKind, en.chatView.kindLabels);
  const media = countRows<MediaType>(stats.data.mediaCounts, en.chatView.mediaLabels);
  return (
    <>
      <SettingsSection heading={en.chatInfo.summaryHeading}>
        <p className="text-text">{chat.isGroup ? en.chatInfo.group : en.chatInfo.oneToOne}</p>
        <p className="text-text">{dateRangeText(stats.data)}</p>
        <p className="text-text-muted text-sm">
          {formatCount(chat.messageCount, en.chatInfo.totalMessages)}
        </p>
      </SettingsSection>
      {kinds.length === 0 ? null : (
        <SettingsSection heading={en.chatInfo.totalsHeading}>
          <CountList rows={kinds} />
        </SettingsSection>
      )}
      <SettingsSection heading={en.chatInfo.mediaHeading}>
        <p className="text-text">
          {chat.mediaCount === 0
            ? en.chatInfo.noMedia
            : formatCount(chat.mediaCount, en.chatInfo.mediaSummary, {
                bytes: formatBytes(chat.mediaBytes),
              })}
        </p>
        <CountList rows={media} />
        <Link
          to={`/chat/${chat.id}/media`}
          className="text-accent flex min-h-11 items-center font-semibold"
        >
          {en.chatInfo.openGallery}
        </Link>
      </SettingsSection>
    </>
  );
}
