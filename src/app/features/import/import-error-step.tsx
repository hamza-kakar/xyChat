import { useState } from 'react';
import { en } from '../../i18n/en';
import { APP_VERSION } from '../../config';
import { PARSER_VERSION } from '../../../core/parser';
import type { ImportError } from '../../../workers/import-detect';

/** Props for {@link ImportErrorStep}. */
export interface ImportErrorStepProps {
  readonly error: ImportError;
  readonly onRetry: () => void;
}

/** Error step: a plain-language message mapped from the typed code,
 * plus "Copy diagnostic details" (codes/counts/versions only — never
 * message or file content). */
export function ImportErrorStep({ error, onRetry }: ImportErrorStepProps) {
  const [copied, setCopied] = useState(false);
  const mapped: string = en.import.errors[error.code];
  const message = error.code === 'CANCELLED' ? en.import.errorCancelled : mapped;
  //  diagnostics carry the typed code,
  // counts and app/parser versions — never detail strings (which may
  // contain engine text), never message or file content.
  const diagnostics = JSON.stringify(
    { code: error.code, appVersion: APP_VERSION, parserVersion: PARSER_VERSION },
    null,
    2,
  );

  return (
    <main className="safe-area bg-surface flex min-h-dvh">
      <div className="mx-auto flex w-full max-w-md flex-col justify-center gap-4 px-6">
        <h1 className="text-text text-2xl font-bold">{en.import.errorTitle}</h1>
        <p className="text-text" dir="auto">
          {message}
        </p>
        <button
          type="button"
          className="text-text border-border min-h-11 rounded-lg border px-4 py-2 text-sm"
          onClick={() => {
            navigator.clipboard
              .writeText(diagnostics)
              .then(() => {
                setCopied(true);
              })
              .catch(() => {
                setCopied(false);
              });
          }}
        >
          {copied ? en.import.errorCopied : en.import.errorCopyDiagnostics}
        </button>
        <button
          type="button"
          className="bg-accent text-surface min-h-11 rounded-lg px-4 py-2 font-semibold"
          onClick={onRetry}
        >
          {en.import.errorRetryButton}
        </button>
      </div>
    </main>
  );
}
