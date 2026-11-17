import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { UnsupportedScreen } from './unsupported-screen';

describe('UnsupportedScreen', () => {
  it('lists every failed capability in human terms', () => {
    render(<UnsupportedScreen failures={['opfs', 'navigatorLocks']} />);
    expect(
      screen.getByRole('heading', { name: 'This browser isn’t supported' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Private file storage (OPFS)')).toBeInTheDocument();
    expect(screen.getByText('Single-instance locking (navigator.locks)')).toBeInTheDocument();
  });
});
