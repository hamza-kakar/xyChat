import { useNavigate } from 'react-router';
import { en } from '../../i18n/en';
import type { BeginOutcome } from '../../../client/import-client';

/** Props for {@link ImportReportStep}. */
export interface ImportReportStepProps {
  readonly outcome: BeginOutcome;
  readonly onOpenChat: () => void;
}

/** Report step (§12.8.6): success summary, warnings grouped by code with
 * plain-language notes, and the Open chat button. Diagnostics (codes and
 * counts only, §18.7) come from the outcome, never message content. */
export function ImportReportStep({ outcome, onOpenChat }: ImportReportStepProps) {
  const navigate = useNavigate();
  const warningEntries = Object.entries(outcome.report.warningsByCode);
  const warningCount = warningEntries.reduce((sum, [, count]) => sum + count, 0);

  return (
    <main className="safe-area bg-surface mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-6">
      <h1 className="text-text text-2xl font-bold">{en.import.reportTitle}</h1>
      <ul className="text-text flex flex-col gap-1 text-sm">
        <li>{en.import.reportAdded.replace('{count}', String(outcome.commit.messagesInserted))}</li>
        <li>
          {en.import.reportDuplicates.replace('{count}', String(outcome.commit.duplicatesSkipped))}
        </li>
        <li>
          {en.import.reportMediaStored.replace('{count}', String(outcome.report.mediaStored))}
        </li>
        {outcome.report.mediaMissing > 0 ? (
          <li>
            {en.import.reportMediaMissing.replace('{count}', String(outcome.report.mediaMissing))}
          </li>
        ) : null}
        {outcome.report.mediaOmitted > 0 ? (
          <li>
            {en.import.reportMediaOmitted.replace('{count}', String(outcome.report.mediaOmitted))}
          </li>
        ) : null}
        {outcome.commit.mediaUpgraded > 0 ? (
          <li>
            {en.import.reportUpgraded.replace('{count}', String(outcome.commit.mediaUpgraded))}
          </li>
        ) : null}
        <li>
          {en.import.reportDuration.replace(
            '{seconds}',
            (outcome.report.durationMs / 1000).toFixed(1),
          )}
        </li>
        {outcome.report.replacementChars > 0 ? (
          <li className="text-text-muted">
            {en.import.reportDecoding.replace('{count}', String(outcome.report.replacementChars))}
          </li>
        ) : null}
        <li className={warningCount > 0 ? 'text-text' : 'text-text-muted'}>
          {warningCount > 0
            ? en.import.reportWarnings.replace('{count}', String(warningCount))
            : en.import.reportNoWarnings}
        </li>
      </ul>
      {warningEntries.length > 0 ? (
        <ul className="text-text-muted flex flex-col gap-1 text-xs">
          {warningEntries.map(([code, count]) => (
            <li key={code}>
              {code} × {count}
            </li>
          ))}
        </ul>
      ) : null}
      <button
        type="button"
        className="bg-accent text-surface min-h-11 rounded-lg px-4 py-2 font-semibold"
        onClick={onOpenChat}
      >
        {en.import.reportOpenChat}
      </button>
      <button
        type="button"
        className="text-text-muted min-h-11 px-4 py-2 text-sm"
        onClick={() => {
          void navigate('/');
        }}
      >
        {en.import.reportDoneButton}
      </button>
    </main>
  );
}
