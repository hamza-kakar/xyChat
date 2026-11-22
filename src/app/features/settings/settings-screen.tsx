/**
 * Settings (AGENTS.md §12.3 `#/settings`, §12.9): appearance, app lock,
 * storage, diagnostics and about. Backup and restore join in M8.
 */
import { en } from '../../i18n/en';
import { ScreenHeader } from '../../components/screen-header';
import { AboutSection } from './about-section';
import { AppearanceSection } from './appearance-section';
import { DiagnosticsSection } from './diagnostics-section';
import { LockSection } from './lock-section';
import { StorageSection } from './storage-section';

export function SettingsScreen() {
  return (
    <main className="bg-surface safe-sides-bottom flex min-h-dvh flex-col">
      <ScreenHeader title={en.settings.title} backTo="/" backLabel={en.settings.backLabel} />
      <div className="divide-border mx-auto flex w-full max-w-2xl flex-col divide-y">
        <AppearanceSection />
        <LockSection />
        <StorageSection />
        <DiagnosticsSection />
        <AboutSection />
      </div>
    </main>
  );
}
