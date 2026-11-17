import type { CapabilityFailure } from '../../../platform/capabilities';
import { en } from '../../i18n/en';

interface UnsupportedScreenProps {
  readonly failures: readonly CapabilityFailure[];
}

/** Full-screen capability failure page (AGENTS.md §12.11). */
export function UnsupportedScreen({ failures }: UnsupportedScreenProps) {
  return (
    <main className="safe-area bg-surface flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-text text-xl font-bold">{en.boot.unsupportedTitle}</h1>
      <p className="text-text-muted max-w-md">{en.boot.unsupportedIntro}</p>
      <ul className="text-text list-inside list-disc text-start">
        {failures.map((failure) => (
          <li key={failure.id}>
            {en.capability[failure.id]}
            {failure.reason !== '' ? (
              <span className="text-text-muted block ps-4 text-xs break-all">{failure.reason}</span>
            ) : null}
          </li>
        ))}
      </ul>
      <p className="text-text-muted max-w-md text-sm">{en.boot.minimumRequirements}</p>
    </main>
  );
}
