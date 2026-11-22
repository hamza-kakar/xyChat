/**
 * Bottom sheet on the native `<dialog>` (AGENTS.md §16): `showModal()`
 * traps focus and handles Escape; focus returns to the element that opened
 * the sheet when it closes. The close button is always present.
 */
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { CloseIcon } from './icons';

/** Props for {@link Sheet}. */
export interface SheetProps {
  readonly open: boolean;
  readonly title: string;
  readonly closeLabel: string;
  readonly onClose: () => void;
  readonly children: ReactNode;
}

export function Sheet({ open, title, closeLabel, onClose, children }: SheetProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!open || dialog === null) {
      return undefined;
    }
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!dialog.open) {
      dialog.showModal();
    }
    return () => {
      if (dialog.open) {
        dialog.close();
      }
      opener?.focus();
    };
  }, [open]);

  if (!open) {
    return null;
  }
  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      className="bg-surface-raised text-text safe-area fixed inset-x-0 top-auto bottom-0 m-0 w-full max-w-none rounded-t-2xl p-0 backdrop:bg-black/50 md:mx-auto md:mb-8 md:max-w-md md:rounded-2xl"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="flex flex-col gap-2 px-4 pt-3 pb-4">
        <div className="flex items-center justify-between gap-2">
          <h2 id={titleId} className="truncate text-lg font-semibold" dir="auto">
            {title}
          </h2>
          <button
            type="button"
            aria-label={closeLabel}
            className="text-text-muted -me-2 flex min-h-11 min-w-11 items-center justify-center rounded-full"
            onClick={onClose}
          >
            <CloseIcon />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}

/** A full-width action row inside a sheet. */
export function SheetButton({
  onClick,
  children,
  tone = 'default',
  disabled = false,
}: {
  readonly onClick: () => void;
  readonly children: ReactNode;
  readonly tone?: 'default' | 'danger';
  readonly disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      className={`min-h-11 rounded-lg px-3 py-2 text-start disabled:opacity-60 ${
        tone === 'danger' ? 'text-danger font-semibold' : 'text-text'
      }`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
