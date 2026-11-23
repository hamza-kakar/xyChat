/**
 * App lock gate. The screens stay mounted underneath
 * (an import keeps running) but are inert and hidden while the lock screen
 * or the privacy cover is up, and the overlay sits in the top layer above
 * any open sheet or viewer. Nothing renders before the lock state is
 * known, so a locked app never flashes its chats at launch.
 */
import { useMemo, type ReactNode } from 'react';
import { APP_NAME } from '../../config';
import { en } from '../../i18n/en';
import { formatString } from '../../i18n/format-string';
import { useLockState } from '../../queries/settings-queries';
import { LockContext } from './lock-context';
import { LockScreen } from './lock-screen';
import { TopLayerOverlay } from './top-layer-overlay';
import { useLockController } from './use-lock-controller';

/** Props for {@link LockGate}. */
export interface LockGateProps {
  readonly children: ReactNode;
}

/** An opaque full-screen cover showing only the app name. */
export function PrivacyCover() {
  return (
    <div
      id="privacy-cover"
      className="bg-surface fixed inset-0 z-50 flex items-center justify-center"
    >
      <p className="text-text-muted text-xl font-semibold">
        {formatString(en.lock.coverLabel, { appName: APP_NAME })}
      </p>
    </div>
  );
}

function LockStateFailed() {
  return (
    <main className="bg-surface safe-area flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-text text-lg font-semibold">{en.lock.stateFailed}</h1>
      <button
        type="button"
        className="bg-accent text-accent-contrast min-h-11 rounded-lg px-6 font-semibold"
        onClick={() => {
          window.location.reload();
        }}
      >
        {en.lock.reload}
      </button>
    </main>
  );
}

export function LockGate({ children }: LockGateProps) {
  const lockState = useLockState();
  const controller = useLockController(lockState.data);
  const actions = useMemo(() => ({ lockNow: controller.lockNow }), [controller.lockNow]);

  if (lockState.data === undefined) {
    return lockState.isError ? <LockStateFailed /> : <PrivacyCover />;
  }
  if (controller.locked === null) {
    return <PrivacyCover />;
  }
  let overlay: ReactNode = null;
  if (controller.locked) {
    overlay = (
      <LockScreen initialLockedUntil={lockState.data.lockedUntil} onUnlock={controller.unlock} />
    );
  } else if (controller.covered) {
    overlay = <PrivacyCover />;
  }
  const hidden = overlay !== null;
  return (
    <LockContext value={actions}>
      <div className="contents" inert={hidden} aria-hidden={hidden ? true : undefined}>
        {children}
      </div>
      {overlay === null ? null : <TopLayerOverlay>{overlay}</TopLayerOverlay>}
    </LockContext>
  );
}
