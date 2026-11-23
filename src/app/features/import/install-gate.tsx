import { isIosSafari } from '../../../platform/install';
import { APP_NAME } from '../../config';
import { en } from '../../i18n/en';
import { formatString } from '../../i18n/format-string';

/** Props for {@link InstallGate}. */
export interface InstallGateProps {
  /** Called when the user proceeds (standalone or explicit bypass). */
  readonly onProceed: () => void;
}

/** Blocking install gate: imports in a Safari tab live in
 * separate, evictable storage — the user installs first, or explicitly
 * accepts the risk. (The parent renders this component only when the gate
 * applies.) */
export function InstallGate({ onProceed }: InstallGateProps) {
  const step = isIosSafari()
    ? en.install.gateSteps.ios
    : formatString(en.install.gateSteps.generic, { appName: APP_NAME });
  const title = formatString(en.install.gateTitle, { appName: APP_NAME });
  const body = formatString(en.install.gateBody, { appName: APP_NAME });
  return (
    <main className="safe-area bg-surface flex min-h-dvh">
      <div className="mx-auto flex w-full max-w-md flex-col justify-center gap-4 px-6">
        <h1 className="text-text text-2xl font-bold">{title}</h1>
        <p className="text-text-muted">{body}</p>
        <p className="text-text-muted text-sm">{step}</p>
        <button
          type="button"
          className="bg-accent text-surface mt-2 min-h-11 rounded-lg px-4 py-2 font-semibold"
          onClick={onProceed}
        >
          {en.install.proceedButton}
        </button>
        <button
          type="button"
          className="text-text-muted min-h-11 px-4 py-2 text-sm underline"
          onClick={onProceed}
        >
          {en.install.bypassButton}
        </button>
      </div>
    </main>
  );
}
