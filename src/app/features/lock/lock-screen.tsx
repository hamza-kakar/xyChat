/**
 * The lock screen (AGENTS.md §15.3): PIN entry, the backoff countdown
 * after repeated failures, and the no-recovery notice.
 */
import { useEffect, useRef, useState } from 'react';
import { APP_NAME } from '../../config';
import { en } from '../../i18n/en';
import { formatString } from '../../i18n/format-string';
import { useVerifyPin } from '../../queries/settings-queries';
import { secondsUntil } from './auto-lock';

/** Props for {@link LockScreen}. */
export interface LockScreenProps {
  /** A lockout still running from earlier attempts (epoch ms), or null. */
  readonly initialLockedUntil: number | null;
  readonly onUnlock: () => void;
}

/** Re-renders every second while `until` is in the future. */
function useNowUntil(until: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (until === null || until <= Date.now()) {
      return undefined;
    }
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => {
      clearInterval(timer);
    };
  }, [until, now]);
  return now;
}

export function LockScreen({ initialLockedUntil, onUnlock }: LockScreenProps) {
  const [pin, setPin] = useState('');
  const [lockedUntil, setLockedUntil] = useState(initialLockedUntil);
  const [problem, setProblem] = useState<'wrong' | 'failed' | null>(null);
  const verify = useVerifyPin();
  const inputRef = useRef<HTMLInputElement>(null);
  const now = useNowUntil(lockedUntil);
  const seconds = lockedUntil === null ? 0 : secondsUntil(lockedUntil, now);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const onSubmit = (): void => {
    verify.mutate(pin, {
      onSuccess: (result) => {
        if (result.ok) {
          onUnlock();
          return;
        }
        setPin('');
        setLockedUntil(result.lockedUntil);
        setProblem('wrong');
        inputRef.current?.focus();
      },
      onError: () => {
        setProblem('failed');
      },
    });
  };

  let message: string | null = null;
  if (seconds > 0) {
    message = formatString(en.lock.lockedOut, { seconds });
  } else if (problem === 'wrong') {
    message = en.lock.wrongPin;
  } else if (problem === 'failed') {
    message = en.lock.failed;
  }

  return (
    <main className="bg-surface safe-area fixed inset-0 z-50 flex flex-col items-center justify-center overflow-y-auto">
      <div className="flex w-full max-w-xs flex-col gap-4 px-6 text-center">
        <h1 className="text-text text-xl font-bold">
          {formatString(en.lock.title, { appName: APP_NAME })}
        </h1>
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          <label className="text-text flex flex-col gap-1 text-sm">
            {en.lock.pinLabel}
            <input
              ref={inputRef}
              type="password"
              inputMode="numeric"
              autoComplete="off"
              maxLength={8}
              value={pin}
              className="border-border bg-surface-raised text-text min-h-11 rounded-lg border px-3 text-center text-2xl tracking-widest"
              onChange={(event) => {
                setPin(event.target.value.replace(/\D/gu, ''));
              }}
            />
          </label>
          {message === null ? null : (
            <p role="alert" className="text-danger text-sm">
              {message}
            </p>
          )}
          <button
            type="submit"
            disabled={pin === '' || verify.isPending || seconds > 0}
            className="bg-accent text-accent-contrast min-h-11 rounded-lg px-4 font-semibold disabled:opacity-60"
          >
            {verify.isPending ? en.lock.checking : en.lock.unlock}
          </button>
        </form>
        <p className="text-text-muted text-sm">{en.lock.forgot}</p>
      </div>
    </main>
  );
}
