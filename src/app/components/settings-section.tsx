/**
 * A titled section of a settings-style page (a landmark
 * named by its heading).
 */
import { useId, type ReactNode } from 'react';

/** Props for {@link SettingsSection}. */
export interface SettingsSectionProps {
  readonly heading: string;
  readonly id?: string;
  readonly children: ReactNode;
}

export function SettingsSection({ heading, id, children }: SettingsSectionProps) {
  const headingId = useId();
  return (
    <section id={id} aria-labelledby={headingId} className="flex flex-col gap-3 px-4 py-5">
      <h2 id={headingId} className="text-text text-base font-semibold">
        {heading}
      </h2>
      {children}
    </section>
  );
}
