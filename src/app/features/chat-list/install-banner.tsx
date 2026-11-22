/**
 * Install banner (AGENTS.md §12.10): shown on the chat list when running
 * in an iOS Safari tab; dismissible for the session.
 */
import { useState } from 'react';
import { APP_NAME } from '../../config';
import { en } from '../../i18n/en';
import { formatString } from '../../i18n/format-string';
import { isIosSafari, isStandalone } from '../../../platform/install';
import { CloseIcon } from '../../components/icons';

export function InstallBanner() {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed || isStandalone() || !isIosSafari()) {
    return null;
  }
  return (
    <aside className="bg-surface-raised border-border flex items-center gap-2 border-b py-1 ps-4 pe-1 text-sm">
      <p className="text-text flex-1">
        {formatString(en.installBanner.text, { appName: APP_NAME })}
      </p>
      <button
        type="button"
        aria-label={en.installBanner.dismiss}
        className="text-text-muted flex min-h-11 min-w-11 items-center justify-center"
        onClick={() => {
          setDismissed(true);
        }}
      >
        <CloseIcon />
      </button>
    </aside>
  );
}
