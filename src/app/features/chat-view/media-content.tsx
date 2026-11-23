/**
 * Media bubbles (AGENTS.md §12.5, §13). Images show their stored
 * thumbnail with space reserved from the original size, so rows never
 * jump; stickers show without bubble chrome. Videos show a lazily made
 * thumbnail (§13.3), voice notes and audio play in place (§13.2), and
 * photos, videos and documents open the full-screen viewer.
 */
import { useContext, type ReactNode } from 'react';
import { en } from '../../i18n/en';
import { formatBytes, formatString } from '../../i18n/format-string';
import { DocumentIcon, MicIcon, PhotoIcon, PlayIcon, VideoIcon } from '../../components/icons';
import { useMediaUrl } from '../../hooks/use-media-url';
import type { AttachmentView, WindowMessage } from '../../../client/db-client';
import { AudioPlayer, useVideoThumbnail } from '../media';
import { OpenMediaContext } from './open-media-context';

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

/** The bubble box of an image or video, sized from the stored dimensions. */
function MediaBox({
  attachment,
  isSticker,
  children,
}: {
  readonly attachment: AttachmentView;
  readonly isSticker: boolean;
  readonly children: ReactNode;
}) {
  return (
    <div
      className={
        isSticker ? 'w-40 max-w-full' : 'relative w-64 max-w-full overflow-hidden rounded-lg'
      }
      style={{
        aspectRatio: aspectOf(attachment) ?? (isSticker ? '1 / 1' : '4 / 3'),
        maxHeight: isSticker ? STICKER_MAX_PX : undefined,
      }}
    >
      {children}
    </div>
  );
}

function BoxImage({ url, label }: { readonly url: string | null; readonly label: string }) {
  return url === null ? (
    <div className="bg-surface/50 h-full w-full" />
  ) : (
    <img
      src={url}
      alt={label}
      loading="lazy"
      decoding="async"
      className="h-full w-full object-cover"
    />
  );
}

/** A sticker: the file itself, no chrome, not a control. */
function Sticker({ attachment }: { readonly attachment: AttachmentView }) {
  const path = attachment.opfsPath ?? attachment.thumbPath;
  const url = useMediaUrl(path);
  if (path === null) {
    return <MediaTile attachment={attachment} />;
  }
  return (
    <MediaBox attachment={attachment} isSticker>
      <BoxImage url={url} label={en.chatView.mediaLabels.sticker} />
    </MediaBox>
  );
}

/** A photo thumbnail; falls back to the tile without one. */
function PhotoPreview({ attachment }: { readonly attachment: AttachmentView }) {
  const url = useMediaUrl(attachment.thumbPath);
  if (attachment.thumbPath === null) {
    return <MediaTile attachment={attachment} />;
  }
  return (
    <MediaBox attachment={attachment} isSticker={false}>
      <BoxImage url={url} label={en.chatView.mediaLabels[attachment.mediaType]} />
    </MediaBox>
  );
}

/** A video thumbnail (stored, or made on first sight) with a play badge. */
function VideoPreview({ attachment }: { readonly attachment: AttachmentView }) {
  const path = useVideoThumbnail(attachment);
  const url = useMediaUrl(path);
  return (
    <MediaBox attachment={attachment} isSticker={false}>
      {path === null ? (
        <div className="bg-surface/50 flex h-full w-full items-center justify-center">
          <VideoIcon className="h-8 w-8" />
        </div>
      ) : (
        <BoxImage url={url} label={en.chatView.mediaLabels[attachment.mediaType]} />
      )}
      <span className="absolute inset-0 flex items-center justify-center">
        <span className="rounded-full bg-black/60 p-2 text-white">
          <PlayIcon className="h-6 w-6" />
        </span>
      </span>
    </MediaBox>
  );
}

/** Whether the preview is the text tile (type icon, name, size) rather
 * than a picture. */
function isTilePreview(attachment: AttachmentView): boolean {
  const { mediaType } = attachment;
  if (mediaType === 'image') {
    return attachment.thumbPath === null;
  }
  if (mediaType === 'gif' || mediaType === 'video') {
    const isVideoFile = mediaType === 'video' || attachment.mime?.startsWith('video/') === true;
    return !isVideoFile && attachment.thumbPath === null;
  }
  return true;
}

/** The preview inside a viewer button, by media type. */
function Preview({ attachment }: { readonly attachment: AttachmentView }) {
  if (isTilePreview(attachment)) {
    return <MediaTile attachment={attachment} />;
  }
  // GIFs from WhatsApp are usually MP4 files; a real GIF shows as a photo.
  const isVideoFile =
    attachment.mediaType === 'video' || attachment.mime?.startsWith('video/') === true;
  return isVideoFile ? (
    <VideoPreview attachment={attachment} />
  ) : (
    <PhotoPreview attachment={attachment} />
  );
}

/** A preview that opens the full-screen viewer on this one item (a plain
 * preview outside a chat view). */
function ViewerButton({
  message,
  attachment,
}: {
  readonly message: WindowMessage;
  readonly attachment: AttachmentView;
}) {
  const openMedia = useContext(OpenMediaContext);
  if (openMedia === null) {
    return <Preview attachment={attachment} />;
  }
  // A tile's visible name and size must be part of the button's name
  // (WCAG 2.5.3), so only pictures get a label of their own.
  const isTile = isTilePreview(attachment);
  return (
    <button
      type="button"
      aria-label={
        isTile
          ? undefined
          : formatString(en.chatView.openMedia, {
              label: en.chatView.mediaLabels[attachment.mediaType],
            })
      }
      aria-haspopup="dialog"
      className="block max-w-full text-start"
      onClick={() => {
        openMedia(message, attachment);
      }}
    >
      {isTile ? <span className="sr-only">{en.chatView.openTile}</span> : null}
      <Preview attachment={attachment} />
    </button>
  );
}

/** Props for {@link MediaContent}. */
export interface MediaContentProps {
  readonly message: WindowMessage;
  readonly attachment: AttachmentView | undefined;
}

/** The media part of a media message (the caption renders below it). */
export function MediaContent({ message, attachment }: MediaContentProps) {
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
  const { mediaType } = attachment;
  if (mediaType === 'sticker') {
    return <Sticker attachment={attachment} />;
  }
  if (mediaType === 'voice' || mediaType === 'audio') {
    return <AudioPlayer attachment={attachment} tone="bubble" />;
  }
  return <ViewerButton message={message} attachment={attachment} />;
}
