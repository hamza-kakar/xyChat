import type { CapabilityId } from '../../../platform/capabilities';
import { en } from '../../i18n/en';

interface UnsupportedScreenProps {
  readonly failures: readonly CapabilityId[];
}

/** Full-screen capability failure page (AGENTS.md §12.11). */
export function UnsupportedScreen({ failures }: UnsupportedScreenProps) {
  return (
    <main className="safe-area bg-surface flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-text text-xl font-bold">{en.boot.unsupportedTitle}</h1>
      <p className="text-text-muted max-w-md">{en.boot.unsupportedIntro}</p>
      <ul className="text-text list-inside list-disc text-start">
        {failures.map((id) => (
          <li key={id}>{en.capability[id]}</li>
        ))}
      </ul>
      <p className="text-text-muted max-w-md text-sm">{en.boot.minimumRequirements}</p>
    </main>
  );
}
