/**
 * Gallery items (AGENTS.md §12.6, §13.1, §13.3): square thumbnail tiles
 * for photos and videos, and list rows for audio and documents. Each opens
 * the full-screen viewer.
 */
import { memo } from 'react';
import { formatDate } from '../../../core/dates';
import { en } from '../../i18n/en';
import { formatBytes } from '../../i18n/format-string';
import { DocumentIcon, MicIcon, PhotoIcon, PlayIcon, VideoIcon } from '../../components/icons';
import { useMediaUrl } from '../../hooks/use-media-url';
import type { GalleryItemView } from '../../../client/db-client';
import { formatClock, galleryItemLabel, mediaLabel } from './media-format';
import { useVideoThumbnail } from './video-thumbnails';

const MS_PER_SECOND = 1000;

/** Props for gallery tiles and rows. */
export interface GalleryItemProps {
  readonly item: GalleryItemView;
  readonly index: number;
  readonly onOpen: (index: number) => void;
}

/** The path a photo-like tile shows: the thumbnail, or a sticker's file. */
function photoThumbPath(item: GalleryItemView): string | null {
  const { attachment } = item;
  return attachment.mediaType === 'sticker'
    ? (attachment.thumbPath ?? attachment.opfsPath)
    : attachment.thumbPath;
}

function TileImage({ path, isVideo }: { readonly path: string | null; readonly isVideo: boolean }) {
  const url = useMediaUrl(path);
  const Icon = isVideo ? VideoIcon : PhotoIcon;
  return (
    <>
      {url === null ? (
        <span className="text-text-muted flex h-full w-full items-center justify-center">
          <Icon className="h-8 w-8" />
        </span>
      ) : (
        <img
          src={url}
          alt=""
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
        />
      )}
      {isVideo ? (
        <span className="absolute end-1 bottom-1 rounded-full bg-black/60 p-1 text-white">
          <PlayIcon className="h-4 w-4" />
        </span>
      ) : null}
    </>
  );
}

function VideoTileImage({ item }: { readonly item: GalleryItemView }) {
  const path = useVideoThumbnail(item.attachment);
  return <TileImage path={path} isVideo />;
}

/** A square tile in the Photos or Videos grid. */
export const GalleryTile = memo(function GalleryTile({ item, index, onOpen }: GalleryItemProps) {
  const isVideoTile =
    item.attachment.mediaType === 'video' ||
    (item.attachment.mediaType === 'gif' && item.attachment.mime?.startsWith('video/') === true);
  return (
    <button
      type="button"
      aria-label={galleryItemLabel(item, navigator.language)}
      className="bg-surface-raised relative aspect-square w-full overflow-hidden"
      onClick={() => {
        onOpen(index);
      }}
    >
      {isVideoTile ? (
        <VideoTileImage item={item} />
      ) : (
        <TileImage path={photoThumbPath(item)} isVideo={false} />
      )}
    </button>
  );
});

/** A row in the Audio or Documents list. */
export const GalleryListRow = memo(function GalleryListRow({
  item,
  index,
  onOpen,
}: GalleryItemProps) {
  const { attachment, message } = item;
  const isAudio = attachment.mediaType === 'voice' || attachment.mediaType === 'audio';
  const Icon = isAudio ? MicIcon : DocumentIcon;
  const name = isAudio ? mediaLabel(item) : (attachment.fileName ?? mediaLabel(item));
  const detail = isAudio
    ? attachment.durationMs === null
      ? null
      : formatClock(attachment.durationMs / MS_PER_SECOND)
    : attachment.byteSize === null
      ? null
      : formatBytes(attachment.byteSize);
  return (
    <button
      type="button"
      aria-label={galleryItemLabel(item, navigator.language)}
      className="border-border flex min-h-14 w-full items-center gap-3 border-b px-4 py-2 text-start"
      onClick={() => {
        onOpen(index);
      }}
    >
      <Icon className="text-accent h-7 w-7 shrink-0" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-text truncate font-medium" dir="auto">
          {name}
        </span>
        <span className="text-text-muted truncate text-sm" dir="auto">
          {message.authorName ?? en.media.unknownSender}
          {' · '}
          {formatDate(message.tsLocal, { locale: navigator.language })}
        </span>
      </span>
      {detail === null ? null : <span className="text-text-muted text-sm">{detail}</span>}
    </button>
  );
});
