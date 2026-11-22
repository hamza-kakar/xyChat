import { act, fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/providers';
import { useLockActions } from './lock-context';
import { LockGate } from './lock-gate';

const db = vi.hoisted(() => ({
  getLockState: vi.fn(),
  verifyPin: vi.fn(),
}));

vi.mock('../../../client/db-client', () => ({ dbClient: db }));

function setVisibility(state: 'hidden' | 'visible'): void {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: state });
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

function LockButton() {
  const { lockNow } = useLockActions();
  return (
    <button type="button" onClick={lockNow}>
      lock it
    </button>
  );
}

function renderGate() {
  return renderWithProviders(
    <LockGate>
      <p>chat content</p>
      <LockButton />
    </LockGate>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  db.getLockState.mockResolvedValue({ hasPin: true, autoLockMinutes: 0, lockedUntil: null });
  db.verifyPin.mockResolvedValue({ ok: true, lockedUntil: null });
});

afterEach(() => {
  setVisibility('visible');
  vi.useRealTimers();
});

describe('LockGate (§15.3)', () => {
  it('shows only the cover until the lock state is known', () => {
    db.getLockState.mockReturnValue(new Promise(() => undefined));
    const { container } = renderGate();
    expect(container.querySelector('#privacy-cover')).not.toBeNull();
    expect(screen.queryByText('chat content')).not.toBeInTheDocument();
  });

  it('opens straight to the content without a PIN', async () => {
    db.getLockState.mockResolvedValue({ hasPin: false, autoLockMinutes: 0, lockedUntil: null });
    renderGate();
    expect(await screen.findByText('chat content')).toBeVisible();
    expect(screen.queryByRole('heading', { name: /is locked/u })).not.toBeInTheDocument();
  });

  it('starts locked with a PIN, keeps the content inert, and unlocks', async () => {
    const user = userEvent.setup();
    renderGate();
    const pin = await screen.findByLabelText('PIN');
    expect(pin).toHaveFocus();
    expect(screen.getByText('chat content').closest('[inert]')).not.toBeNull();

    db.verifyPin.mockResolvedValueOnce({ ok: false, lockedUntil: null });
    await user.type(pin, '12ab34');
    expect(pin).toHaveValue('1234');
    await user.click(screen.getByRole('button', { name: 'Unlock' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Wrong PIN.');
    expect(pin).toHaveValue('');

    await user.type(pin, '2468');
    await user.click(screen.getByRole('button', { name: 'Unlock' }));
    expect(db.verifyPin).toHaveBeenLastCalledWith('2468');
    await vi.waitFor(() => {
      expect(screen.queryByLabelText('PIN')).not.toBeInTheDocument();
    });
    expect(screen.getByText('chat content').closest('[inert]')).toBeNull();
  });

  it('counts down a lockout and refuses attempts meanwhile', async () => {
    const user = userEvent.setup();
    db.getLockState.mockResolvedValue({
      hasPin: true,
      autoLockMinutes: 0,
      lockedUntil: Date.now() + 30_000,
    });
    renderGate();
    await user.type(await screen.findByLabelText('PIN'), '1234');
    expect(screen.getByRole('alert')).toHaveTextContent(/Try again in (30|29) s/u);
    expect(screen.getByRole('button', { name: 'Unlock' })).toBeDisabled();
  });

  it('reports a failed check', async () => {
    const user = userEvent.setup();
    db.verifyPin.mockRejectedValueOnce(new Error('TIMEOUT'));
    renderGate();
    await user.type(await screen.findByLabelText('PIN'), '1234');
    await user.click(screen.getByRole('button', { name: 'Unlock' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('could not be checked');
  });

  it('covers the app when hidden and locks at once with the immediate setting', async () => {
    db.getLockState.mockResolvedValue({ hasPin: false, autoLockMinutes: 0, lockedUntil: null });
    const { container } = renderGate();
    await screen.findByText('chat content');
    setVisibility('hidden');
    expect(container.querySelector('#privacy-cover')).not.toBeNull();
    setVisibility('visible');
    expect(container.querySelector('#privacy-cover')).toBeNull();
  });

  it('locks when hidden with a PIN and the immediate setting', async () => {
    const user = userEvent.setup();
    renderGate();
    await user.type(await screen.findByLabelText('PIN'), '2468');
    await user.click(screen.getByRole('button', { name: 'Unlock' }));
    await vi.waitFor(() => {
      expect(screen.queryByLabelText('PIN')).not.toBeInTheDocument();
    });
    setVisibility('hidden');
    setVisibility('visible');
    expect(await screen.findByLabelText('PIN')).toBeInTheDocument();
  });

  it('locks after the inactivity delay, and on demand', async () => {
    db.getLockState.mockResolvedValue({ hasPin: true, autoLockMinutes: 1, lockedUntil: null });
    const user = userEvent.setup();
    renderGate();
    await user.type(await screen.findByLabelText('PIN'), '2468');
    await user.click(screen.getByRole('button', { name: 'Unlock' }));
    await vi.waitFor(() => {
      expect(screen.queryByLabelText('PIN')).not.toBeInTheDocument();
    });
    // Hiding briefly does not lock with a delay set.
    setVisibility('hidden');
    setVisibility('visible');
    expect(screen.queryByLabelText('PIN')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'lock it' }));
    expect(await screen.findByLabelText('PIN')).toBeInTheDocument();
  });

  it('locks after a minute without interaction', async () => {
    db.getLockState.mockResolvedValue({ hasPin: false, autoLockMinutes: 1, lockedUntil: null });
    const { client } = renderGate();
    await screen.findByText('chat content');
    // Setting a PIN during the session does not lock it; the delay starts.
    vi.useFakeTimers();
    db.getLockState.mockResolvedValue({ hasPin: true, autoLockMinutes: 1, lockedUntil: null });
    await act(async () => {
      await client.invalidateQueries();
    });
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    fireEvent.pointerDown(screen.getByText('chat content'));
    act(() => {
      vi.advanceTimersByTime(45_000);
    });
    expect(screen.queryByLabelText('PIN')).not.toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(20_000);
    });
    expect(screen.getByLabelText('PIN')).toBeInTheDocument();
  });
});
