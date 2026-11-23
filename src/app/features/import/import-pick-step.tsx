import { useId } from 'react';
import { en } from '../../i18n/en';

/** Props for {@link ImportPickStep}. */
export interface ImportPickStepProps {
  readonly onPicked: (file: File) => void;
}

/** File-picker step (§12.8.2): instructions plus the §12.8.2 input with the
 * accepted types. The visible label is the input's control, so keyboard
 * and screen-reader users reach one named element. */
export function ImportPickStep({ onPicked }: ImportPickStepProps) {
  const inputId = useId();
  return (
    <main className="safe-area bg-surface flex min-h-dvh">
      <div className="mx-auto flex w-full max-w-md flex-col justify-center gap-4 px-6">
        <h1 className="text-text text-2xl font-bold">{en.import.pickTitle}</h1>
        <p className="text-text-muted">{en.import.pickBody}</p>
        <label
          htmlFor={inputId}
          className="bg-accent text-surface has-focus-visible:outline-focus-ring flex min-h-11 cursor-pointer items-center justify-center rounded-lg px-4 py-2 text-center font-semibold has-focus-visible:outline-2 has-focus-visible:outline-offset-2"
        >
          {en.import.pickButton}
          <input
            id={inputId}
            type="file"
            accept=".zip,.txt,application/zip,text/plain"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file !== undefined) {
                onPicked(file);
              }
            }}
          />
        </label>
      </div>
    </main>
  );
}
