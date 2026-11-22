/**
 * Settings → About (AGENTS.md §12.9): the privacy statement, the reminder
 * that the original exports are the backup, the source link, and the
 * licenses of the bundled dependencies.
 */
import { APP_NAME, SOURCE_URL } from '../../config';
import { en } from '../../i18n/en';
import { formatString } from '../../i18n/format-string';
import { SettingsSection } from '../../components/settings-section';
import { useLicenses } from '../../queries/settings-queries';

function Licenses() {
  const licenses = useLicenses();
  if (licenses.isPending) {
    return <p className="text-text-muted text-sm">{en.settings.about.licensesLoading}</p>;
  }
  if (licenses.isError) {
    return <p className="text-text-muted text-sm">{en.settings.about.licensesFailed}</p>;
  }
  return (
    <ul className="flex flex-col gap-1">
      {licenses.data.map((entry) => (
        <li key={`${entry.name}@${entry.version}`}>
          <details className="border-border rounded-lg border">
            <summary className="text-text flex min-h-11 cursor-pointer items-center px-3 text-sm">
              {formatString(en.settings.about.licenseSummary, {
                name: entry.name,
                version: entry.version,
                license: entry.license,
              })}
            </summary>
            <pre className="text-text-muted max-h-64 overflow-auto px-3 pb-3 text-xs whitespace-pre-wrap">
              {entry.text ??
                formatString(en.settings.about.licenseNoText, { license: entry.license })}
            </pre>
          </details>
        </li>
      ))}
    </ul>
  );
}

export function AboutSection() {
  return (
    <SettingsSection heading={en.settings.about.heading} id="about">
      <p className="text-text">{formatString(en.settings.about.privacy, { appName: APP_NAME })}</p>
      <p className="text-text-muted text-sm">{en.settings.about.originals}</p>
      <a
        href={SOURCE_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="text-accent flex min-h-11 items-center font-semibold underline"
      >
        {en.settings.about.source}
      </a>
      <h3 className="text-text-muted text-sm">{en.settings.about.licensesHeading}</h3>
      <Licenses />
    </SettingsSection>
  );
}
