/**
 * Hosts the lock screen or privacy cover in a modal `<dialog>`. Sheets and
 * the media viewer are modal dialogs too, and the browser paints those in
 * the top layer above any z-index; a later `showModal()` stacks above them
 * and makes them inert, so the cover always wins.
 */
import { useLayoutEffect, useRef, type ReactNode } from 'react';

/** Props for {@link TopLayerOverlay}. */
export interface TopLayerOverlayProps {
  readonly children: ReactNode;
}

function openModal(dialog: HTMLDialogElement): void {
  if (!dialog.open && dialog.isConnected) {
    dialog.showModal();
  }
}

export function TopLayerOverlay({ children }: TopLayerOverlayProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  // A layout effect runs inside the same synchronous commit as the hide
  // handler's flushSync, before the app-switcher snapshot.
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) {
      return undefined;
    }
    openModal(dialog);
    return () => {
      if (dialog.open) {
        dialog.close();
      }
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="bg-surface m-0 h-dvh max-h-none w-full max-w-none border-0 p-0 backdrop:bg-black"
      onCancel={(event) => {
        event.preventDefault();
      }}
      onClose={(event) => {
        // The browser may still close it (repeated Escape); it must stay up.
        openModal(event.currentTarget);
      }}
    >
      {children}
    </dialog>
  );
}
