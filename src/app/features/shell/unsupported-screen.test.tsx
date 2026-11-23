import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { UnsupportedScreen } from './unsupported-screen';

describe('UnsupportedScreen', () => {
  it('lists failed capabilities with localized names only', () => {
    render(
      <UnsupportedScreen
        failures={[
          { id: 'opfs', reason: 'SecurityError: the operation is insecure.' },
          { id: 'navigatorLocks', reason: '' },
        ]}
      />,
    );
    expect(
      screen.getByRole('heading', { name: 'This browser isn\u2019t supported' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Private file storage (OPFS)')).toBeInTheDocument();
    expect(screen.getByText('Single-instance locking (navigator.locks)')).toBeInTheDocument();
    // Raw engine error text is diagnostics, never UI copy.
    expect(screen.queryByText(/SecurityError/)).not.toBeInTheDocument();
  });
});
