import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { trackLongTask, useHoldLongTask, useIsLongTaskRunning } from './use-long-task';

function Holder({ active }: { readonly active: boolean }) {
  useHoldLongTask(active);
  return null;
}

function Indicator() {
  return <p>{useIsLongTaskRunning() ? 'running' : 'idle'}</p>;
}

describe('useHoldLongTask', () => {
  it('counts every holder and releases on unmount', () => {
    const { rerender } = render(
      <>
        <Holder active />
        <Holder active />
        <Indicator />
      </>,
    );
    expect(screen.getByText('running')).toBeInTheDocument();
    rerender(
      <>
        <Holder active={false} />
        <Holder active />
        <Indicator />
      </>,
    );
    expect(screen.getByText('running')).toBeInTheDocument();
    rerender(<Indicator />);
    expect(screen.getByText('idle')).toBeInTheDocument();
  });
});

describe('trackLongTask', () => {
  it('holds a task until the job settles, failed or not', async () => {
    render(<Indicator />);
    let finish: () => void = () => undefined;
    const done = trackLongTask(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    const failed = expect(trackLongTask(Promise.reject(new Error('worker gone')))).rejects.toThrow(
      'worker gone',
    );
    expect(await screen.findByText('running')).toBeInTheDocument();
    await failed;
    expect(screen.getByText('running')).toBeInTheDocument();
    finish();
    await done;
    expect(await screen.findByText('idle')).toBeInTheDocument();
  });
});
