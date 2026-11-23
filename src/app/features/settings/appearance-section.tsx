/**
 * Settings → Appearance: System, Light or Dark.
 */
import { en } from '../../i18n/en';
import { SettingsSection } from '../../components/settings-section';
import { THEME_PREFERENCES, useThemePreference } from '../../hooks/use-theme-preference';

export function AppearanceSection() {
  const [theme, setTheme] = useThemePreference();
  return (
    <SettingsSection heading={en.settings.appearance.heading} id="appearance">
      <fieldset className="flex flex-col gap-1">
        <legend className="text-text-muted mb-1 text-sm">
          {en.settings.appearance.themeLabel}
        </legend>
        {THEME_PREFERENCES.map((choice) => (
          <label key={choice} className="text-text flex min-h-11 items-center gap-3">
            <input
              type="radio"
              name="theme"
              value={choice}
              checked={theme === choice}
              className="accent-accent h-5 w-5"
              onChange={() => {
                setTheme(choice);
              }}
            />
            {en.settings.appearance[choice]}
          </label>
        ))}
      </fieldset>
    </SettingsSection>
  );
}
