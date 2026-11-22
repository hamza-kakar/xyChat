/**
 * Progress step tests (§12.8.5): the §9.1 phase list, the determinate bar
 * driven by progress events, and the cancel button.
 */
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { emitImportProgress, onImportProgress } from '../../../client/import-client';
import { ImportProgressStep } from './import-progress-step';

describe('ImportProgressStep (§12.8.5)', () => {
  it('lists the §9.1 phases and advances on progress events', () => {
    const unsubscribe = onImportProgress(() => undefined);
    render(<ImportProgressStep onCancel={() => undefined} />);
    expect(screen.getByText('Reading archive')).toBeInTheDocument();
    expect(screen.getByText('Fingerprinting')).toBeInTheDocument();
    expect(screen.getByText('Generating thumbnails')).toBeInTheDocument();

    act(() => {
      emitImportProgress({ phase: 'parsing', current: 2_500, total: 5_000 });
    });
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '50');
    expect(screen.getByText('Parsing messages')).toHaveClass('font-semibold');
    unsubscribe();
  });

  it('cancels via the button (§9.3)', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(<ImportProgressStep onCancel={onCancel} />);
    await user.click(screen.getByRole('button', { name: 'Cancel import' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('disables the button and says so while a cancel is pending', () => {
    render(<ImportProgressStep onCancel={() => undefined} isCancelling />);
    const button = screen.getByRole('button', { name: 'Cancelling…' });
    expect(button).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Cancel import' })).toBeNull();
  });
});

/** A fake `navigator.wakeLock` whose request resolves only when told to. */
function installDeferredWakeLock(): {
  readonly resolve: () => void;
  readonly release: ReturnType<typeof vi.fn>;
} {
  const release = vi.fn(() => Promise.resolve());
  let resolveRequest: (sentinel: { release: () => Promise<void> }) => void = () => undefined;
  const request = vi.fn(
    () =>
      new Promise<{ release: () => Promise<void> }>((resolve) => {
        resolveRequest = resolve;
      }),
  );
  Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request } });
  return {
    resolve: () => {
      resolveRequest({ release });
    },
    release,
  };
}

describe('ImportProgressStep wake lock (§12.8.5)', () => {
  afterEach(() => {
    Reflect.deleteProperty(navigator, 'wakeLock');
  });

  it('releases a lock that is granted after the step unmounts', async () => {
    const lock = installDeferredWakeLock();
    const { unmount } = render(<ImportProgressStep onCancel={() => undefined} />);
    unmount();
    lock.resolve();
    await waitFor(() => {
      expect(lock.release).toHaveBeenCalledTimes(1);
    });
  });

  it('holds a granted lock until the step unmounts, then releases it', async () => {
    const lock = installDeferredWakeLock();
    const { unmount } = render(<ImportProgressStep onCancel={() => undefined} />);
    await act(async () => {
      lock.resolve();
      await Promise.resolve();
    });
    expect(lock.release).not.toHaveBeenCalled();
    unmount();
    expect(lock.release).toHaveBeenCalledTimes(1);
  });
});
