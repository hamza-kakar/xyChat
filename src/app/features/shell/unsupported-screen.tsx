import { useEffect } from 'react';
import type { CapabilityFailure } from '../../../platform/capabilities';
import { logger } from '../../logging';
import { APP_NAME } from '../../app-name';
import { en } from '../../i18n/en';
import { formatString } from '../../i18n/format-string';

interface UnsupportedScreenProps {
  readonly failures: readonly CapabilityFailure[];
}

/** Full-screen capability failure page. */
export function UnsupportedScreen({ failures }: UnsupportedScreenProps) {
  useEffect(() => {
    // Engine error text is diagnostics, not UI copy: log it structured.
    for (const failure of failures) {
      logger.warn('boot.capability_failed', { capability: failure.id, reason: failure.reason });
    }
  }, [failures]);

  return (
    <main className="safe-area bg-surface flex min-h-dvh">
      <div className="flex w-full flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="text-text text-xl font-bold">{en.boot.unsupportedTitle}</h1>
        <p className="text-text-muted max-w-md">
          {formatString(en.boot.unsupportedIntro, { appName: APP_NAME })}
        </p>
        <ul className="text-text list-inside list-disc text-start">
          {failures.map((failure) => (
            <li key={failure.id}>{en.capability[failure.id]}</li>
          ))}
        </ul>
        <p className="text-text-muted max-w-md text-sm">
          {formatString(en.boot.minimumRequirements, { appName: APP_NAME })}
        </p>
      </div>
    </main>
  );
}
