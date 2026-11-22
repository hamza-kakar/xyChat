/**
 * Settings → Diagnostics (AGENTS.md §12.9, §18.7): versions, the browser
 * capability report and the local log viewer with Copy and Clear. Logs
 * hold codes, counts and ids only — never content, names or file names.
 */
import { useState, useSyncExternalStore } from 'react';
import { PARSER_VERSION } from '../../../core/parser/version';
import { APP_VERSION } from '../../config';
import { en } from '../../i18n/en';
import { SettingsSection } from '../../components/settings-section';
import { logger, type LogEntry } from '../../logging/logger';
import {
  clearAllLogs,
  earlierLogEntries,
  subscribeEarlierLogs,
} from '../../logging/log-persistence';
import { useCapabilityReport, useSchemaVersion } from '../../queries/settings-queries';

/** Session entries shown at most (the newest). */
const SHOWN_SESSION_ENTRIES = 200;

type Entry = Pick<LogEntry, 'timestamp' | 'level' | 'code' | 'data'>;

function LogList({
  heading,
  entries,
}: {
  readonly heading: string;
  readonly entries: readonly Entry[];
}) {
  if (entries.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-col gap-1">
      <h3 className="text-text-muted text-sm">{heading}</h3>
      <ol className="border-border bg-surface-raised flex max-h-72 flex-col overflow-y-auto rounded-lg border font-mono text-xs">
        {entries.map((entry, index) => (
          <li
            key={`${String(entry.timestamp)}-${String(index)}`}
            className="border-border text-text border-b px-2 py-1 break-all last:border-b-0"
          >
            {`${new Date(entry.timestamp).toISOString()} ${entry.level} ${entry.code} ${JSON.stringify(entry.data)}`}
          </li>
        ))}
      </ol>
    </div>
  );
}

function useLogs(): { readonly earlier: readonly Entry[]; readonly session: readonly Entry[] } {
  const earlier = useSyncExternalStore(subscribeEarlierLogs, earlierLogEntries, earlierLogEntries);
  const session = useSyncExternalStore(logger.subscribe, logger.recent, logger.recent);
  return { earlier, session: session.slice(-SHOWN_SESSION_ENTRIES) };
}

export function DiagnosticsSection() {
  const schema = useSchemaVersion();
  const capabilities = useCapabilityReport();
  const { earlier, session } = useLogs();
  const [copyState, setCopyState] = useState<'copied' | 'failed' | null>(null);
  const versions = [
    [en.settings.diagnostics.appVersion, APP_VERSION],
    [en.settings.diagnostics.parserVersion, PARSER_VERSION],
    [en.settings.diagnostics.schemaVersion, schema.data === undefined ? '' : String(schema.data)],
  ] as const;

  const copy = (): void => {
    const report = {
      appVersion: APP_VERSION,
      parserVersion: PARSER_VERSION,
      schemaVersion: schema.data ?? null,
      capabilities: capabilities.data ?? [],
      earlier,
      session,
    };
    navigator.clipboard
      .writeText(JSON.stringify(report, null, 2))
      .then(() => {
        setCopyState('copied');
      })
      .catch(() => {
        setCopyState('failed');
      });
  };

  return (
    <SettingsSection heading={en.settings.diagnostics.heading} id="diagnostics">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        {versions.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-text-muted">{label}</dt>
            <dd className="text-text">{value}</dd>
          </div>
        ))}
      </dl>
      <h3 className="text-text-muted text-sm">{en.settings.diagnostics.capabilitiesHeading}</h3>
      <ul className="flex flex-col gap-1 text-sm">
        {(capabilities.data ?? []).map((row) => (
          <li key={row.id} className="flex justify-between gap-3">
            <span className="text-text">{en.capability[row.id]}</span>
            <span className={row.ok ? 'text-text-muted' : 'text-danger font-semibold'}>
              {row.ok ? en.settings.diagnostics.available : en.settings.diagnostics.missing}
            </span>
          </li>
        ))}
      </ul>
      <h3 className="text-text-muted text-sm">{en.settings.diagnostics.logHeading}</h3>
      <p className="text-text-muted text-sm">{en.settings.diagnostics.logHint}</p>
      {earlier.length === 0 && session.length === 0 ? (
        <p className="text-text-muted text-sm">{en.settings.diagnostics.logEmpty}</p>
      ) : null}
      <LogList heading={en.settings.diagnostics.logEarlier} entries={earlier} />
      <LogList heading={en.settings.diagnostics.logSession} entries={session} />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="border-border text-text min-h-11 rounded-lg border px-4 font-semibold"
          onClick={copy}
        >
          {en.settings.diagnostics.copyLog}
        </button>
        <button
          type="button"
          className="border-border text-danger min-h-11 rounded-lg border px-4 font-semibold"
          onClick={() => {
            setCopyState(null);
            void clearAllLogs().catch(() => undefined);
          }}
        >
          {en.settings.diagnostics.clearLog}
        </button>
      </div>
      {copyState === null ? null : (
        <p role="status" className="text-text-muted text-sm">
          {copyState === 'copied'
            ? en.settings.diagnostics.copied
            : en.settings.diagnostics.copyFailed}
        </p>
      )}
    </SettingsSection>
  );
}
