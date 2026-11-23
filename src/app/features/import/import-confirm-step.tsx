import { useState } from 'react';
import { en } from '../../i18n/en';
import { formatTimestamp } from '../../../core/dates/format';
import { formatBytes } from '../../i18n/format-string';
import type { DetectReport } from '../../../workers/import-detect';
import type { ChatId } from '../../../core/ids';

/** What the start button hands back to the container (choices). */
export interface ConfirmChoices {
  readonly confirmedTitle: string;
  readonly targetChatId: ChatId | null;
  readonly selfName: string | null;
}

/** Props for {@link ImportConfirmStep}. */
export interface ImportConfirmStepProps {
  readonly report: DetectReport;
  readonly file: File;
  /** Existing chat whose title matched — the "update existing"
   * preselect. Null when nothing matched. */
  readonly suggestedTargetChatId: ChatId | null;
  /** True while the order toggle re-runs detection. */
  readonly reorderRunning: boolean;
  /** Called with the chosen order when the toggle changes. */
  readonly onDateOrder: (order: 'DMY' | 'MDY') => void;
  readonly onStart: (report: DetectReport, file: File, choices: ConfirmChoices) => void;
  readonly onBack: () => void;
}

/**  live preview: the first 20 parsed messages as mini rows. */
function MessagePreview(props: { readonly report: DetectReport; readonly locale: string }) {
  return (
    <section aria-label={en.import.confirmPreviewHeading} className="flex flex-col gap-2">
      <h2 className="text-text text-sm font-semibold">{en.import.confirmPreviewHeading}</h2>
      <ol className="flex flex-col gap-1">
        {props.report.format.sampleMessages.slice(0, 20).map((message) => (
          <li
            key={message.seq}
            className="text-text bg-surface-raised rounded-lg px-3 py-2 text-sm"
          >
            <span className="text-text-muted me-2 text-xs">
              {message.author === null ? '' : `${message.author} · `}
              {formatTimestamp(message.timestamp, props.locale)}
            </span>
            <span dir="auto">{message.body === '' ? '📎' : message.body}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** One choice button with the selected styling. */
function ChoiceButton(props: {
  readonly selected: boolean;
  readonly label: string;
  readonly onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={
        props.selected
          ? 'bg-accent text-surface min-h-11 rounded-lg px-3 font-semibold'
          : 'text-text border-border min-h-11 rounded-lg border px-3'
      }
      onClick={() => {
        props.onSelect();
      }}
    >
      {props.label}
    </button>
  );
}

/** Confirmation step: detected facts, the DMY/MDY toggle with a
 * live preview when the order is ambiguous, editable title, "which one is
 * you", destination, and the summary. */
export function ImportConfirmStep({
  report,
  file,
  suggestedTargetChatId,
  reorderRunning,
  onDateOrder,
  onStart,
  onBack,
}: ImportConfirmStepProps) {
  const [title, setTitle] = useState(report.title);
  const [selfName, setSelfName] = useState<string | null>(null);
  const [targetChatId, setTargetChatId] = useState<ChatId | null>(suggestedTargetChatId);
  const ambiguous = report.format.dateOrderSource !== 'unambiguous';
  const locale = navigator.language;
  const missing = report.mediaFilesMissing;
  const summary = en.import.confirmSummary
    .replace('{messages}', String(report.messagesCount))
    .replace('{participants}', String(report.participants.length))
    .replace('{media}', String(report.mediaFilesFound + missing));

  return (
    <main className="safe-area bg-surface flex min-h-dvh">
      <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-6 py-6">
        <h1 className="text-text text-2xl font-bold">{en.import.confirmTitle}</h1>

        {ambiguous ? (
          <fieldset className="flex flex-col gap-2">
            <legend className="text-text-muted text-sm">{en.import.confirmDateOrderHint}</legend>
            <div className="flex gap-2">
              <ChoiceButton
                selected={report.format.dateOrder === 'DMY'}
                label={en.import.dateOrderDmy}
                onSelect={() => {
                  onDateOrder('DMY');
                }}
              />
              <ChoiceButton
                selected={report.format.dateOrder === 'MDY'}
                label={en.import.dateOrderMdy}
                onSelect={() => {
                  onDateOrder('MDY');
                }}
              />
            </div>
          </fieldset>
        ) : null}

        <MessagePreview report={report} locale={locale} />

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-text-muted">{en.import.confirmTitleField}</span>
          <input
            type="text"
            value={title}
            onChange={(event) => {
              setTitle(event.target.value);
            }}
            className="border-border text-text bg-surface-raised min-h-11 rounded-lg border px-3"
          />
        </label>

        <fieldset className="flex flex-col gap-1">
          <legend className="text-text-muted text-sm">{en.import.confirmSelfHeading}</legend>
          <div className="flex flex-wrap gap-2">
            {report.participants.map((name) => (
              <ChoiceButton
                key={name}
                selected={selfName === name}
                label={name}
                onSelect={() => {
                  setSelfName(selfName === name ? null : name);
                }}
              />
            ))}
            <ChoiceButton
              selected={selfName === null}
              label={en.import.confirmSelfSkip}
              onSelect={() => {
                setSelfName(null);
              }}
            />
          </div>
        </fieldset>

        {suggestedTargetChatId !== null ? (
          <fieldset className="flex flex-col gap-1">
            <legend className="text-text-muted text-sm">{en.import.confirmTargetHeading}</legend>
            <div className="flex gap-2">
              <ChoiceButton
                selected={targetChatId === null}
                label={en.import.confirmTargetNew}
                onSelect={() => {
                  setTargetChatId(null);
                }}
              />
              <ChoiceButton
                selected={targetChatId !== null}
                label={en.import.confirmTargetMerge.replace('{title}', report.title)}
                onSelect={() => {
                  setTargetChatId(suggestedTargetChatId);
                }}
              />
            </div>
          </fieldset>
        ) : null}

        <p className="text-text-muted text-sm">
          {summary}
          {missing > 0
            ? ` · ${en.import.confirmMissingMedia.replace('{missing}', String(missing))}`
            : ''}
        </p>
        <p className="text-text-muted text-xs">
          {en.import.confirmQuota
            .replace('{archive}', formatBytes(file.size))
            .replace('{uncompressed}', formatBytes(report.uncompressedTotalBytes))}
          {report.freeBytes !== null
            ? ` · ${en.import.confirmFreeStorage.replace('{free}', formatBytes(report.freeBytes))}`
            : ''}
        </p>

        <div className="mt-auto flex gap-2">
          <button
            type="button"
            className="text-text border-border min-h-11 flex-1 rounded-lg border px-3"
            onClick={onBack}
          >
            {en.import.confirmBackButton}
          </button>
          <button
            type="button"
            disabled={reorderRunning || title.trim() === ''}
            className="bg-accent text-surface min-h-11 flex-1 rounded-lg px-3 font-semibold disabled:opacity-50"
            onClick={() => {
              onStart(report, file, {
                confirmedTitle: title.trim(),
                targetChatId,
                selfName,
              });
            }}
          >
            {en.import.confirmStartButton}
          </button>
        </div>
      </div>
    </main>
  );
}
