/**
 * Media bubbles (AGENTS.md §12.5, §13.1). Images show their stored
 * thumbnail with space reserved from the original size, so rows never
 * jump. Stickers show without bubble chrome. Video, audio and documents
 * show a labeled tile; playback and viewers come with the media milestone,
 * so nothing here pretends to be a control.
 */
import { en } from '../../i18n/en';
import { formatBytes } from '../../i18n/format-string';
import { DocumentIcon, MicIcon, PhotoIcon, VideoIcon } from '../../components/icons';
import { useMediaUrl } from '../../hooks/use-media-url';
import type { AttachmentView } from '../../../client/db-client';

/** Largest sticker edge (§13.1). */
const STICKER_MAX_PX = 160;

/** `aspect-ratio` from the stored size, when known. */
function aspectOf(attachment: AttachmentView): string | undefined {
  const { width, height } = attachment;
  return width !== null && height !== null && width > 0 && height > 0
    ? `${String(width)} / ${String(height)}`
    : undefined;
}

function TypeIcon({ attachment }: { readonly attachment: AttachmentView }) {
  const className = 'h-6 w-6 shrink-0';
  switch (attachment.mediaType) {
    case 'image':
    case 'sticker':
      return <PhotoIcon className={className} />;
    case 'video':
    case 'gif':
      return <VideoIcon className={className} />;
    case 'audio':
    case 'voice':
      return <MicIcon className={className} />;
    case 'document':
    case 'contact-card':
    case 'other':
      return <DocumentIcon className={className} />;
  }
}

/** A labeled tile: icon, type label (or file name) and size. */
function MediaTile({ attachment }: { readonly attachment: AttachmentView }) {
  const label = en.chatView.mediaLabels[attachment.mediaType];
  const showName = attachment.mediaType === 'document' || attachment.mediaType === 'other';
  return (
    <div className="flex min-h-11 items-center gap-3 py-1">
      <TypeIcon attachment={attachment} />
      <span className="flex min-w-0 flex-col">
        <span className="truncate font-medium" dir="auto">
          {showName ? (attachment.fileName ?? label) : label}
        </span>
        {attachment.byteSize === null ? null : (
          <span className="text-text-muted-on-bubble text-xs">
            {formatBytes(attachment.byteSize)}
          </span>
        )}
      </span>
    </div>
  );
}

/** A stored image or sticker; falls back to the tile when it can't load. */
function StoredImage({
  attachment,
  isSticker,
}: {
  readonly attachment: AttachmentView;
  readonly isSticker: boolean;
}) {
  const path = isSticker ? (attachment.opfsPath ?? attachment.thumbPath) : attachment.thumbPath;
  const url = useMediaUrl(path);
  if (path === null) {
    return <MediaTile attachment={attachment} />;
  }
  const label = en.chatView.mediaLabels[attachment.mediaType];
  return (
    <div
      className={isSticker ? 'max-w-40' : 'w-64 max-w-full overflow-hidden rounded-lg'}
      style={{
        aspectRatio: aspectOf(attachment) ?? '1 / 1',
        maxHeight: isSticker ? STICKER_MAX_PX : undefined,
      }}
    >
      {url === null ? (
        <div className="bg-surface/50 h-full w-full" />
      ) : (
        <img
          src={url}
          alt={label}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
        />
      )}
    </div>
  );
}

/** Props for {@link MediaContent}. */
export interface MediaContentProps {
  readonly attachment: AttachmentView | undefined;
}

/** The media part of a media message (the caption renders below it). */
export function MediaContent({ attachment }: MediaContentProps) {
  if (attachment === undefined || attachment.status === 'omitted') {
    return <p className="text-text-muted-on-bubble italic">{en.chatView.mediaOmitted}</p>;
  }
  if (attachment.status === 'missing') {
    return (
      <div className="flex flex-col gap-1">
        <MediaTile attachment={attachment} />
        <p className="text-text-muted-on-bubble text-sm italic">{en.chatView.mediaMissing}</p>
      </div>
    );
  }
  if (attachment.mediaType === 'image' || attachment.mediaType === 'sticker') {
    return <StoredImage attachment={attachment} isSticker={attachment.mediaType === 'sticker'} />;
  }
  return <MediaTile attachment={attachment} />;
}
