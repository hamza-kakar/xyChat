/**
 * Media gallery screen (`#/chat/:chatId/media?tab=`): tabs for photos, videos, audio, documents and links. The chat
 * id and tab are validated; an invalid id shows "Not found" and an unknown
 * tab opens Photos.
 */
import { Link, useParams, useSearchParams } from 'react-router';
import * as v from 'valibot';
import clsx from 'clsx';
import { asChatId, type ChatId } from '../../../core/ids';
import { en } from '../../i18n/en';
import { BackIcon } from '../../components/icons';
import { useFocusHeading } from '../../hooks/use-focus-heading';
import { useLockPageScroll } from '../../hooks/use-lock-page-scroll';
import { useChat } from '../../queries/chat-queries';
import { GalleryTab } from './gallery-tab';
import { LinksTab } from './links-tab';
import { MEDIA_TABS, parseTab, type MediaTab } from './media-tabs';

/** Chat ids are generated UUIDs; anything else is not a chat. */
const ChatIdParam = v.pipe(v.string(), v.regex(/^[0-9a-f-]{8,64}$/iu));

export function MediaScreen() {
  useLockPageScroll();
  const params = useParams();
  const [search] = useSearchParams();
  const parsed = v.safeParse(ChatIdParam, params['chatId']);
  const tab = parseTab(search.get('tab'));
  return (
    <main className="bg-surface safe-sides-bottom flex h-dvh flex-col">
      {parsed.success ? (
        <MediaContent chatId={asChatId(parsed.output)} tab={tab} />
      ) : (
        <>
          <MediaHeader backTo="/" subtitle={null} tab={null} />
          <p role="alert" className="text-text-muted p-6">
            {en.media.notFound}
          </p>
        </>
      )}
    </main>
  );
}

function MediaContent({ chatId, tab }: { readonly chatId: ChatId; readonly tab: MediaTab }) {
  const chat = useChat(chatId);
  const backTo = `/chat/${chatId}`;
  if (chat.isPending) {
    return (
      <>
        <MediaHeader backTo={backTo} subtitle={null} tab={null} />
        <p className="text-text-muted p-6">{en.media.loading}</p>
      </>
    );
  }
  if (chat.isError || chat.data === null) {
    return (
      <>
        <MediaHeader backTo="/" subtitle={null} tab={null} />
        <p role="alert" className="text-text-muted p-6">
          {chat.isError ? en.media.failed : en.media.notFound}
        </p>
      </>
    );
  }
  return (
    <>
      <MediaHeader backTo={backTo} subtitle={chat.data.title} tab={tab} />
      {tab === 'links' ? (
        <LinksTab key={chatId} chatId={chatId} />
      ) : (
        <GalleryTab key={`${chatId}:${tab}`} chatId={chatId} tab={tab} />
      )}
    </>
  );
}

function MediaHeader({
  backTo,
  subtitle,
  tab,
}: {
  readonly backTo: string;
  readonly subtitle: string | null;
  /** The open tab, or null while there is nothing to switch. */
  readonly tab: MediaTab | null;
}) {
  const headingRef = useFocusHeading<HTMLHeadingElement>();
  return (
    <header className="border-border safe-top border-b">
      <div className="flex items-center gap-1 py-1 ps-1 pe-4">
        <Link
          to={backTo}
          aria-label={en.media.backLabel}
          className="text-accent flex min-h-11 min-w-11 items-center justify-center rounded-full"
        >
          <BackIcon className="h-6 w-6 rtl:-scale-x-100" />
        </Link>
        <div className="flex min-w-0 flex-col ps-2">
          <h1
            ref={headingRef}
            tabIndex={-1}
            className="text-text text-lg font-semibold outline-none"
          >
            {en.media.title}
          </h1>
          {subtitle === null ? null : (
            <p className="text-text-muted truncate text-xs" dir="auto">
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {tab === null ? null : (
        <nav aria-label={en.media.tabsLabel} className="flex overflow-x-auto px-2">
          {MEDIA_TABS.map((name) => (
            <Link
              key={name}
              to={`?tab=${name}`}
              replace
              aria-current={name === tab ? 'page' : undefined}
              className={clsx(
                'flex min-h-11 flex-1 shrink-0 items-center justify-center border-b-2 px-2 text-sm font-semibold',
                name === tab ? 'border-accent text-accent' : 'text-text-muted border-transparent',
              )}
            >
              {en.media.tabs[name]}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
