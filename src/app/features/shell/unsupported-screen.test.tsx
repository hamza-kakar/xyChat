import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { UnsupportedScreen } from './unsupported-screen';

describe('UnsupportedScreen', () => {
  it('lists every failed capability in human terms', () => {
    render(
      <UnsupportedScreen
        failures={[
          { id: 'opfs', reason: 'SecurityError: the operation is insecure.' },
          { id: 'navigatorLocks', reason: '' },
        ]}
      />,
    );
    expect(
      screen.getByRole('heading', { name: 'This browser isn’t supported' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Private file storage (OPFS)')).toBeInTheDocument();
    expect(screen.getByText(/SecurityError/)).toBeInTheDocument();
    expect(screen.getByText('Single-instance locking (navigator.locks)')).toBeInTheDocument();
  });
});
