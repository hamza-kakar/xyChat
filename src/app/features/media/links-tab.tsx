/**
 * Links tab: every link sent in the chat, newest first,
 * with its domain, the message it came from, and "Show in chat".
 */
import { memo, useCallback, useMemo } from 'react';
import { Link } from 'react-router';
import type { ChatId } from '../../../core/ids';
import { formatDate } from '../../../core/dates';
import { en } from '../../i18n/en';
import { LinkIcon } from '../../components/icons';
import { useLinkMessages } from '../../queries/media-queries';
import { linkEntries, type LinkEntry } from './link-entries';
import { VirtualRows } from './virtual-rows';

const LINK_ROW_PX = 112;

const LinkRow = memo(function LinkRow({ entry }: { readonly entry: LinkEntry }) {
  const { message } = entry;
  const sender = message.authorName ?? en.media.unknownSender;
  const date = formatDate(message.tsLocal, { locale: navigator.language });
  return (
    <div className="border-border flex flex-col gap-1 border-b px-4 py-2">
      <a
        href={entry.href}
        target="_blank"
        rel="noopener noreferrer"
        className="flex min-h-11 items-center gap-3"
      >
        <LinkIcon className="text-accent h-6 w-6 shrink-0" />
        <span className="flex min-w-0 flex-col">
          <span className="text-text truncate font-semibold">{entry.domain}</span>
          <span className="text-accent truncate text-sm" dir="ltr">
            {entry.text}
          </span>
        </span>
      </a>
      <p className="text-text-muted line-clamp-2 text-sm break-words" dir="auto">
        {message.body}
      </p>
      <p className="text-text-muted flex items-center justify-between gap-2 text-xs">
        <span className="truncate" dir="auto">
          {sender}
          {' · '}
          {date}
        </span>
        <Link
          to={`/chat/${message.chatId}?seq=${String(message.seq)}`}
          className="text-accent flex min-h-11 items-center px-2 text-sm font-semibold"
        >
          {en.media.showInChat}
        </Link>
      </p>
    </div>
  );
});

/** Props for {@link LinksTab}. */
export interface LinksTabProps {
  readonly chatId: ChatId;
}

export function LinksTab({ chatId }: LinksTabProps) {
  const links = useLinkMessages(chatId, true);
  const entries = useMemo(
    () => linkEntries(links.data?.pages.flatMap((page) => page.messages) ?? []),
    [links.data],
  );
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = links;
  const loadMore = useCallback(() => {
    void fetchNextPage();
  }, [fetchNextPage]);
  if (links.isPending) {
    return <p className="text-text-muted p-6">{en.media.loading}</p>;
  }
  if (links.isError) {
    return (
      <p role="alert" className="text-text-muted p-6">
        {en.media.failed}
      </p>
    );
  }
  if (entries.length === 0 && !hasNextPage) {
    return <p className="text-text-muted p-6 text-center">{en.media.empty.links}</p>;
  }
  return (
    <VirtualRows
      label={en.media.tabs.links}
      count={entries.length}
      rowKey={(index) => entries[index]?.key ?? String(index)}
      estimateSize={() => LINK_ROW_PX}
      renderRow={(index) => {
        const entry = entries[index];
        return entry === undefined ? null : <LinkRow entry={entry} />;
      }}
      hasMore={hasNextPage}
      isLoadingMore={isFetchingNextPage}
      onLoadMore={loadMore}
      footer={
        isFetchingNextPage ? (
          <p className="text-text-muted p-4 text-center text-sm">{en.media.loadingMore}</p>
        ) : null
      }
    />
  );
}
