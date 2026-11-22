/**
 * Full-screen media viewer (AGENTS.md §12.6): image, video, audio or
 * document, with previous/next (buttons, arrow keys and swipes on images),
 * close (button, Escape, swipe down) and "Show in chat". A modal
 * `<dialog>` traps focus and returns it to the opener on close (§16).
 */
import { useCallback, useEffect, useId, useRef, useState, type RefObject } from 'react';
import { Link } from 'react-router';
import { formatDateTime } from '../../../core/dates';
import type { LocalDateTime } from '../../../core/model';
import { en } from '../../i18n/en';
import { formatString } from '../../i18n/format-string';
import { BackIcon, CloseIcon } from '../../components/icons';
import { useMediaUrl } from '../../hooks/use-media-url';
import type { AttachmentView } from '../../../client/db-client';
import { AudioPlayer } from './audio-player';
import { audioPlayback } from './audio-playback';
import { DocumentViewer } from './document-viewer';
import { ImageViewer } from './image-viewer';

/** One item the viewer can show. */
export interface ViewerItem {
  readonly attachment: AttachmentView;
  readonly message: {
    readonly seq: number;
    readonly tsLocal: LocalDateTime;
    readonly authorName: string | null;
  };
}

/** Props for {@link MediaViewer}. */
export interface MediaViewerProps {
  readonly chatId: string;
  readonly items: readonly ViewerItem[];
  readonly index: number;
  readonly onIndexChange: (index: number) => void;
  readonly onClose: () => void;
  /** False inside the chat itself, where the message is already in view. */
  readonly showInChat: boolean;
}

function VideoViewer({ attachment }: { readonly attachment: AttachmentView }) {
  const url = useMediaUrl(attachment.opfsPath);
  const [failed, setFailed] = useState(false);
  if (attachment.opfsPath === null || failed) {
    return <p className="p-6 text-center text-white">{en.media.videoFailed}</p>;
  }
  return url === null ? null : (
    // eslint-disable-next-line jsx-a11y/media-has-caption -- exported chat videos carry no caption tracks to offer.
    <video
      src={url}
      controls
      playsInline
      preload="metadata"
      className="max-h-full max-w-full"
      onError={() => {
        setFailed(true);
      }}
    />
  );
}

function ViewerBody({
  item,
  onSwipe,
}: {
  readonly item: ViewerItem;
  readonly onSwipe: (outcome: 'next' | 'previous' | 'close') => void;
}) {
  const { attachment } = item;
  const label = en.chatView.mediaLabels[attachment.mediaType];
  const isVideoFile = attachment.mime?.startsWith('video/') === true;
  switch (attachment.mediaType) {
    case 'image':
    case 'sticker':
      return <ImageViewer path={attachment.opfsPath} label={label} onSwipe={onSwipe} />;
    case 'gif':
      return isVideoFile ? (
        <VideoViewer attachment={attachment} />
      ) : (
        <ImageViewer path={attachment.opfsPath} label={label} onSwipe={onSwipe} />
      );
    case 'video':
      return <VideoViewer attachment={attachment} />;
    case 'audio':
    case 'voice':
      return (
        <div className="bg-surface-raised text-text rounded-2xl px-4 py-3">
          <AudioPlayer attachment={attachment} tone="surface" />
        </div>
      );
    case 'document':
    case 'contact-card':
    case 'other':
      return <DocumentViewer attachment={attachment} />;
  }
}

/** Opens the dialog modally while mounted; restores focus on close. */
function useModal() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) {
      return undefined;
    }
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!dialog.open) {
      dialog.showModal();
    }
    return () => {
      audioPlayback.pauseCurrent();
      if (dialog.open) {
        dialog.close();
      }
      opener?.focus();
    };
  }, []);
  return dialogRef;
}

/** Arrow keys page through the items (mirrored under RTL); inputs and
 * media controls keep their own arrow keys. */
function useArrowPaging(
  dialogRef: RefObject<HTMLDialogElement | null>,
  go: (delta: number) => void,
): void {
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) {
      return undefined;
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLMediaElement) {
        return;
      }
      const isRtl = document.documentElement.dir === 'rtl';
      if (event.key === (isRtl ? 'ArrowLeft' : 'ArrowRight')) {
        go(1);
      } else if (event.key === (isRtl ? 'ArrowRight' : 'ArrowLeft')) {
        go(-1);
      }
    };
    dialog.addEventListener('keydown', onKey);
    return () => {
      dialog.removeEventListener('keydown', onKey);
    };
  }, [dialogRef, go]);
}

const controlClass =
  'flex min-h-11 min-w-11 items-center justify-center rounded-full text-white disabled:opacity-30';

export function MediaViewer(props: MediaViewerProps) {
  const { chatId, items, index, onIndexChange, onClose, showInChat } = props;
  const dialogRef = useModal();
  const titleId = useId();
  const step = useCallback(
    (delta: number): void => {
      const next = index + delta;
      if (next >= 0 && next < items.length) {
        onIndexChange(next);
      }
    },
    [index, items.length, onIndexChange],
  );
  useArrowPaging(dialogRef, step);
  const item = items[index];
  if (item === undefined) {
    return null;
  }
  const hasPrevious = index > 0;
  const hasNext = index < items.length - 1;
  const go = (next: number): void => {
    step(next - index);
  };
  const label = en.chatView.mediaLabels[item.attachment.mediaType];
  const title =
    items.length > 1
      ? formatString(en.media.viewerTitle, { label, position: index + 1, total: items.length })
      : formatString(en.media.viewerTitleSingle, { label });
  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      className="safe-area fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none bg-black text-white backdrop:bg-black"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-2 px-2 py-1">
          <button
            type="button"
            aria-label={en.media.viewerClose}
            className={controlClass}
            onClick={onClose}
          >
            <CloseIcon />
          </button>
          <div className="flex min-w-0 flex-1 flex-col">
            <h2 id={titleId} className="truncate font-semibold">
              {title}
            </h2>
            <p className="truncate text-xs text-white/80" dir="auto">
              {item.message.authorName ?? en.media.unknownSender}
              {' · '}
              {formatDateTime(item.message.tsLocal, { locale: navigator.language })}
            </p>
          </div>
          {showInChat ? (
            <Link
              to={`/chat/${chatId}?seq=${String(item.message.seq)}`}
              className="flex min-h-11 items-center rounded-lg px-3 font-semibold text-white"
            >
              {en.media.showInChat}
            </Link>
          ) : null}
        </div>
        <div className="flex min-h-0 flex-1 items-center justify-center">
          <ViewerBody
            key={item.attachment.id}
            item={item}
            onSwipe={(outcome) => {
              if (outcome === 'close') {
                onClose();
              } else {
                go(outcome === 'next' ? index + 1 : index - 1);
              }
            }}
          />
        </div>
        {items.length > 1 ? (
          <div className="flex justify-between px-2 py-1">
            <button
              type="button"
              aria-label={en.media.viewerPrevious}
              disabled={!hasPrevious}
              className={controlClass}
              onClick={() => {
                go(index - 1);
              }}
            >
              <BackIcon className="h-6 w-6 rtl:-scale-x-100" />
            </button>
            <button
              type="button"
              aria-label={en.media.viewerNext}
              disabled={!hasNext}
              className={controlClass}
              onClick={() => {
                go(index + 1);
              }}
            >
              <BackIcon className="h-6 w-6 -scale-x-100 rtl:scale-x-100" />
            </button>
          </div>
        ) : null}
      </div>
    </dialog>
  );
}
