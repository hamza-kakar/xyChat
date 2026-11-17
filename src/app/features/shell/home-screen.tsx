import { APP_NAME, APP_VERSION } from '../../config';
import { en } from '../../i18n/en';
import { formatString } from '../../i18n/format-string';

/** Minimal home screen for milestone M0; the chat list replaces it in M4. */
export function HomeScreen() {
  return (
    <main className="safe-area bg-surface flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="text-text text-3xl font-bold tracking-tight">{APP_NAME}</h1>
      <p className="text-text-muted max-w-sm">{en.tagline}</p>
      <p className="text-text-muted text-sm">
        {formatString(en.home.versionLabel, { version: APP_VERSION })}
      </p>
    </main>
  );
}
