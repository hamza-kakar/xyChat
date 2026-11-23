/**
 * Settings → Backup and restore (AGENTS.md §10.6, §12.9). Also points to
 * re-importing the original exports, the user's primary safety net.
 */
import { Link } from 'react-router';
import { en } from '../../../i18n/en';
import { SettingsSection } from '../../../components/settings-section';
import { MakeBackup } from './make-backup';
import { RestoreBackup } from './restore-backup';

export function BackupSection() {
  return (
    <SettingsSection heading={en.backup.heading} id="backup">
      <p className="text-text-muted text-sm">{en.backup.intro}</p>
      <p className="text-text-muted text-sm">{en.backup.exportsNote}</p>
      <Link to="/import" className="text-accent flex min-h-11 items-center font-semibold">
        {en.backup.reimport}
      </Link>
      <MakeBackup />
      <RestoreBackup />
    </SettingsSection>
  );
}
