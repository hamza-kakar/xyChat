/**
 * The PIN forms of Settings → App lock: turn the lock on
 * (new PIN twice), change it (current, then new twice) or turn it off
 * (current). A wrong current PIN counts towards the lockout.
 */
import { useState } from 'react';
import { isValidPin } from '../../../core/app-lock';
import { en } from '../../i18n/en';
import { formatString } from '../../i18n/format-string';
import { useChangePin } from '../../queries/settings-queries';
import { secondsUntil } from '../lock';

/** Which form to show. */
export type PinFormMode = 'set' | 'change' | 'remove';

/** Props for {@link PinForm}. */
export interface PinFormProps {
  readonly mode: PinFormMode;
  readonly onDone: () => void;
}

type Problem =
  | { readonly kind: 'invalid' | 'mismatch' | 'wrong' | 'failed' }
  | { readonly kind: 'locked'; readonly seconds: number };

const SUBMIT_LABELS: Readonly<Record<PinFormMode, string>> = {
  set: en.settings.lock.setPin,
  change: en.settings.lock.changePin,
  remove: en.settings.lock.removePin,
};

function problemText(problem: Problem): string {
  switch (problem.kind) {
    case 'invalid':
      return en.settings.lock.invalidPin;
    case 'mismatch':
      return en.settings.lock.mismatch;
    case 'wrong':
      return en.settings.lock.wrongPin;
    case 'failed':
      return en.settings.lock.failed;
    case 'locked':
      return formatString(en.settings.lock.lockedOut, { seconds: problem.seconds });
  }
}

function PinField(props: {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
}) {
  return (
    <label className="text-text flex flex-col gap-1 text-sm">
      {props.label}
      <input
        type="password"
        inputMode="numeric"
        autoComplete="off"
        maxLength={8}
        value={props.value}
        className="border-border bg-surface-raised text-text min-h-11 rounded-lg border px-3 text-base"
        onChange={(event) => {
          props.onChange(event.target.value.replace(/\D/gu, ''));
        }}
      />
    </label>
  );
}

export function PinForm({ mode, onDone }: PinFormProps) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [problem, setProblem] = useState<Problem | null>(null);
  const changePin = useChangePin();
  const needsCurrent = mode !== 'set';
  const needsNext = mode !== 'remove';

  const submit = (): void => {
    if (needsNext && !isValidPin(next)) {
      setProblem({ kind: 'invalid' });
      return;
    }
    if (needsNext && next !== repeat) {
      setProblem({ kind: 'mismatch' });
      return;
    }
    changePin.mutate(
      { current: needsCurrent ? current : null, next: needsNext ? next : null },
      {
        onSuccess: (result) => {
          if (result.ok) {
            onDone();
            return;
          }
          setCurrent('');
          setProblem(
            result.lockedUntil === null
              ? { kind: 'wrong' }
              : { kind: 'locked', seconds: secondsUntil(result.lockedUntil, Date.now()) },
          );
        },
        onError: () => {
          setProblem({ kind: 'failed' });
        },
      },
    );
  };

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      {needsCurrent ? (
        <PinField label={en.settings.lock.currentPin} value={current} onChange={setCurrent} />
      ) : null}
      {needsNext ? (
        <>
          <PinField label={en.settings.lock.newPin} value={next} onChange={setNext} />
          <PinField label={en.settings.lock.confirmPin} value={repeat} onChange={setRepeat} />
        </>
      ) : null}
      {problem === null ? null : (
        <p role="alert" className="text-danger text-sm">
          {problemText(problem)}
        </p>
      )}
      <button
        type="submit"
        disabled={changePin.isPending}
        className={`min-h-11 rounded-lg px-4 font-semibold disabled:opacity-60 ${
          mode === 'remove' ? 'bg-danger text-danger-contrast' : 'bg-accent text-accent-contrast'
        }`}
      >
        {SUBMIT_LABELS[mode]}
      </button>
    </form>
  );
}
