import { useRef } from 'react';
import { en } from '../../i18n/en';

/** Props for {@link ImportPickStep}. */
export interface ImportPickStepProps {
  readonly onPicked: (file: File) => void;
}

/** File-picker step (§12.8.2): instructions plus the §12.8.2 input with the
 * accepted types. */
export function ImportPickStep({ onPicked }: ImportPickStepProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <main className="safe-area bg-surface flex min-h-dvh">
      <div className="mx-auto flex w-full max-w-md flex-col justify-center gap-4 px-6">
        <h1 className="text-text text-2xl font-bold">{en.import.pickTitle}</h1>
        <p className="text-text-muted">{en.import.pickBody}</p>
        <input
          ref={inputRef}
          type="file"
          accept=".zip,.txt,application/zip,text/plain"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file !== undefined) {
              onPicked(file);
            }
          }}
        />
        <button
          type="button"
          className="bg-accent text-surface min-h-11 rounded-lg px-4 py-2 font-semibold"
          onClick={() => inputRef.current?.click()}
        >
          {en.import.pickButton}
        </button>
      </div>
    </main>
  );
}
