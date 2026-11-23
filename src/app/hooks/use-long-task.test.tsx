import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useHoldLongTask, useIsLongTaskRunning } from './use-long-task';

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
