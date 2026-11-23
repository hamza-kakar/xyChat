/**
 * Settings → App lock: the PIN, the auto-lock delay,
 * "Lock now", and the honest scope statement (a privacy screen, not
 * encryption; no PIN recovery).
 */
import { useState } from 'react';
import { AUTO_LOCK_MINUTES } from '../../../core/app-lock';
import { en } from '../../i18n/en';
import { formatString } from '../../i18n/format-string';
import { SettingsSection } from '../../components/settings-section';
import { useLockState, useSetAutoLock } from '../../queries/settings-queries';
import { useLockActions } from '../lock';
import { PinForm, type PinFormMode } from './pin-form';

function AutoLockChoice({ minutes }: { readonly minutes: number }) {
  const setAutoLock = useSetAutoLock();
  // Show the choice at once, not after the save round trip.
  const shown = setAutoLock.isPending ? setAutoLock.variables : minutes;
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="text-text-muted mb-1 text-sm">{en.settings.lock.autoLockLabel}</legend>
      {AUTO_LOCK_MINUTES.map((choice) => (
        <label key={choice} className="text-text flex min-h-11 items-center gap-3">
          <input
            type="radio"
            name="auto-lock"
            value={choice}
            checked={shown === choice}
            disabled={setAutoLock.isPending}
            className="accent-accent h-5 w-5"
            onChange={() => {
              setAutoLock.mutate(choice);
            }}
          />
          {choice === 0
            ? en.settings.lock.autoLockImmediately
            : formatString(en.settings.lock.autoLockMinutes, { minutes: choice })}
        </label>
      ))}
      {setAutoLock.isError ? (
        <p role="alert" className="text-danger text-sm">
          {en.settings.lock.failed}
        </p>
      ) : null}
    </fieldset>
  );
}

const secondaryButton =
  'border-border text-text min-h-11 rounded-lg border px-4 text-start font-semibold';

export function LockSection() {
  const lockState = useLockState();
  const { lockNow } = useLockActions();
  const [mode, setMode] = useState<PinFormMode | null>(null);
  const [saved, setSaved] = useState(false);
  const hasPin = lockState.data?.hasPin ?? false;
  const done = (): void => {
    setMode(null);
    setSaved(true);
  };

  return (
    <SettingsSection heading={en.settings.lock.heading} id="lock">
      <p className="text-text">{hasPin ? en.settings.lock.on : en.settings.lock.off}</p>
      <p className="text-text-muted text-sm">{en.settings.lock.scope}</p>
      {saved ? (
        <p role="status" className="text-text text-sm">
          {en.settings.lock.saved}
        </p>
      ) : null}
      {lockState.data === undefined ? null : hasPin ? (
        <>
          <AutoLockChoice minutes={lockState.data.autoLockMinutes} />
          <button type="button" className={secondaryButton} onClick={lockNow}>
            {en.settings.lock.lockNow}
          </button>
          {mode === null ? (
            <>
              <button
                type="button"
                className={secondaryButton}
                onClick={() => {
                  setSaved(false);
                  setMode('change');
                }}
              >
                {en.settings.lock.changePin}
              </button>
              <button
                type="button"
                className={`${secondaryButton} text-danger`}
                onClick={() => {
                  setSaved(false);
                  setMode('remove');
                }}
              >
                {en.settings.lock.removePin}
              </button>
            </>
          ) : (
            <>
              <PinForm key={mode} mode={mode} onDone={done} />
              <button
                type="button"
                className={secondaryButton}
                onClick={() => {
                  setMode(null);
                }}
              >
                {en.settings.lock.cancel}
              </button>
            </>
          )}
        </>
      ) : (
        <PinForm key="set" mode="set" onDone={done} />
      )}
    </SettingsSection>
  );
}
