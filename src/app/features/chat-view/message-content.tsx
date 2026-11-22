/**
 * The inside of a bubble, by message kind (AGENTS.md §12.5). System rows
 * and calls render as pills elsewhere; this covers bubble kinds.
 */
import { isJumboEmoji } from '../../../core/text-format/emoji';
import { en } from '../../i18n/en';
import { formatString } from '../../i18n/format-string';
import { BlockedIcon, PinIcon, PollIcon } from '../../components/icons';
import type { WindowMessage } from '../../../client/db-client';
import { RichText } from './rich-text';
import { MediaContent } from './media-content';
import { ContactCard } from './contact-card';

/** Coordinates to six places (~10 cm), enough for a maps link. */
const COORDINATE_DIGITS = 6;

function LocationCard({ message }: { readonly message: WindowMessage }) {
  const location = message.location;
  if (location === null) {
    return <RichText body={message.body} />;
  }
  const lat = location.lat.toFixed(COORDINATE_DIGITS);
  const lng = location.lng.toFixed(COORDINATE_DIGITS);
  return (
    <div className="flex flex-col gap-1 py-1">
      <span className="flex items-center gap-2 font-semibold">
        <PinIcon className="h-5 w-5 shrink-0" />
        <span dir="ltr">{formatString(en.chatView.coordinates, { lat, lng })}</span>
      </span>
      <a
        href={`https://maps.apple.com/?ll=${lat},${lng}`}
        target="_blank"
        rel="noopener noreferrer"
        className="text-link-on-bubble flex min-h-11 items-center font-semibold underline underline-offset-2"
      >
        {en.chatView.openMapsLabel}
      </a>
    </div>
  );
}

function PollCard({ message }: { readonly message: WindowMessage }) {
  const poll = message.poll;
  if (poll === null) {
    return <RichText body={message.body} />;
  }
  return (
    <div className="flex flex-col gap-2 py-1">
      <span className="flex items-start gap-2 font-semibold">
        <PollIcon className="mt-0.5 h-5 w-5 shrink-0" />
        <span dir="auto">{poll.question}</span>
      </span>
      <ul className="flex flex-col gap-1">
        {poll.options.map((option, index) => (
          <li key={index} className="flex items-baseline justify-between gap-3 text-sm">
            <span dir="auto">{option.text}</span>
            {option.votes === null ? null : (
              <span className="text-text-muted-on-bubble shrink-0">
                {option.votes === 1
                  ? en.chatView.pollVote
                  : formatString(en.chatView.pollVotes, { count: option.votes })}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Props for {@link MessageContent}. */
export interface MessageContentProps {
  readonly message: WindowMessage;
}

export function MessageContent({ message }: MessageContentProps) {
  const attachment = message.attachments[0];
  switch (message.kind) {
    case 'deleted':
      return (
        <p className="text-text-muted-on-bubble flex items-center gap-1.5 italic">
          <BlockedIcon className="h-4 w-4 shrink-0" />
          {en.chatView.deleted}
        </p>
      );
    case 'media':
      return (
        <div className="flex flex-col gap-1">
          <MediaContent message={message} attachment={attachment} />
          {message.body === '' ? null : <RichText body={message.body} />}
        </div>
      );
    case 'contact':
      return (
        <div className="flex flex-col gap-1">
          <ContactCard messageRowId={message.rowId} attachment={attachment} />
          {message.body === '' ? null : <RichText body={message.body} />}
        </div>
      );
    case 'location':
      return <LocationCard message={message} />;
    case 'poll':
      return <PollCard message={message} />;
    case 'text':
    case 'system':
    case 'call':
      return isJumboEmoji(message.body) ? (
        <RichText body={message.body} className="text-4xl leading-tight" />
      ) : (
        <RichText body={message.body} />
      );
  }
}
