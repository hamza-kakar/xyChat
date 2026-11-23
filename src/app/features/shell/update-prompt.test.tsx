import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useHoldLongTask } from '../../hooks/use-long-task';
import { registerServiceWorker, type RegisterServiceWorker } from './service-worker-update';
import { UpdatePrompt } from './update-prompt';

const mockedRegister = vi.fn<RegisterServiceWorker>();
const updateServiceWorker = vi.fn<(reloadPage?: boolean) => Promise<void>>(() => Promise.resolve());
let signalNeedRefresh: () => void = () => undefined;

function LongTask({ active }: { readonly active: boolean }) {
  useHoldLongTask(active);
  return null;
}

describe('UpdatePrompt', () => {
  beforeEach(() => {
    updateServiceWorker.mockClear();
    mockedRegister.mockImplementation((options) => {
      signalNeedRefresh = () => {
        options.onNeedRefresh?.();
      };
      return updateServiceWorker;
    });
  });

  it('registers immediately and stays hidden until a worker waits', () => {
    registerServiceWorker(mockedRegister);
    expect(mockedRegister).toHaveBeenCalledWith(expect.objectContaining({ immediate: true }));
    render(<UpdatePrompt />);
    expect(screen.queryByText('Update available')).not.toBeInTheDocument();
  });

  it('waits for a running task, then reloads only on tap', async () => {
    registerServiceWorker(mockedRegister);
    const { rerender } = render(
      <>
        <LongTask active />
        <UpdatePrompt />
      </>,
    );
    act(() => {
      signalNeedRefresh();
    });
    expect(screen.queryByText('Update available')).not.toBeInTheDocument();
    expect(updateServiceWorker).not.toHaveBeenCalled();

    rerender(
      <>
        <LongTask active={false} />
        <UpdatePrompt />
      </>,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Update available');
    await userEvent.click(screen.getByRole('button', { name: 'Reload' }));
    expect(updateServiceWorker).toHaveBeenCalledWith(true);
  });

  it('can be put off for the session', async () => {
    registerServiceWorker(mockedRegister);
    render(<UpdatePrompt />);
    act(() => {
      signalNeedRefresh();
    });
    await userEvent.click(screen.getByRole('button', { name: 'Later' }));
    expect(screen.queryByText('Update available')).not.toBeInTheDocument();
    expect(updateServiceWorker).not.toHaveBeenCalled();
  });
});
