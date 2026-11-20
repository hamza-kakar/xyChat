/**
 * Route table test (§12.3): the home route renders the home screen and the
 * /chat/:chatId placeholder redirects home (the chat view lands in M4).
 */
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { AppRoutes } from './routes';
import { APP_NAME } from './config';

describe('AppRoutes (§12.3)', () => {
  it('renders the home screen on /', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <AppRoutes />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { level: 1, name: APP_NAME })).toBeInTheDocument();
  });

  it('redirects the chat placeholder route home (chat view lands in M4)', () => {
    render(
      <MemoryRouter initialEntries={['/chat/abc']}>
        <AppRoutes />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { level: 1, name: APP_NAME })).toBeInTheDocument();
  });
});
