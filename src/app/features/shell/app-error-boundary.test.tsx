import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AppErrorBoundary } from './app-error-boundary';

function Boom(): never {
  throw new Error('uncaught render error');
}

describe('AppErrorBoundary', () => {
  it('renders the fallback UI when a child throws', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(
      <AppErrorBoundary>
        <Boom />
      </AppErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong');
    expect(screen.getByRole('button', { name: 'Reload app' })).toBeInTheDocument();
    consoleError.mockRestore();
  });

  it('renders children when nothing throws', () => {
    render(
      <AppErrorBoundary>
        <p>healthy content</p>
      </AppErrorBoundary>,
    );
    expect(screen.getByText('healthy content')).toBeInTheDocument();
  });
});
