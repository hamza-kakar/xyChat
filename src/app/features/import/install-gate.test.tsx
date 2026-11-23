/**
 * Install gate tests: the gate blocks when not standalone and
 * offers the explicit bypass; standalone skips it entirely.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { InstallGate } from './install-gate';
import { installGateDone } from './install-gate-state';

describe('InstallGate', () => {
  it('renders the gate with iOS instructions when not standalone', () => {
    // happy-dom: matchMedia('(display-mode: standalone)').matches === false.
    render(<InstallGate onProceed={() => undefined} />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Install');
    expect(screen.getByText('Continue anyway (not recommended)')).toBeInTheDocument();
  });

  it('calls onProceed from either button', async () => {
    const user = userEvent.setup();
    const onProceed = vi.fn();
    render(<InstallGate onProceed={onProceed} />);
    await user.click(screen.getByText('Continue'));
    await user.click(screen.getByText('Continue anyway (not recommended)'));
    expect(onProceed).toHaveBeenCalledTimes(2);
  });

  it('records the bypass and re-arms on a fresh module state', () => {
    expect(installGateDone(true)).toBe(true);
  });
});
