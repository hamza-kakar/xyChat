/**
 * Progress step tests (§12.8.5): the §9.1 phase list, the determinate bar
 * driven by progress events, and the cancel button.
 */
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
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
});
