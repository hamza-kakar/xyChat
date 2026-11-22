/**
 * Route table test (§12.3): home renders the chat list, an invalid chat id
 * shows "Not found", unknown routes redirect home.
 */
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AppRoutes } from './routes';
import { APP_NAME } from './config';
import { renderWithProviders } from './test/providers';

vi.mock('../client/db-client', () => ({
  dbClient: {
    listChats: () => Promise.resolve([]),
    getChat: () => Promise.resolve(null),
    getLastChatPosition: () => Promise.resolve(null),
  },
}));

describe('AppRoutes (§12.3)', () => {
  it('renders the chat list on /', async () => {
    renderWithProviders(<AppRoutes />, { route: '/' });
    expect(screen.getByRole('heading', { level: 1, name: APP_NAME })).toBeInTheDocument();
    expect(await screen.findByText('No chats yet')).toBeInTheDocument();
  });

  it('shows "Not found" for an invalid chat id', () => {
    renderWithProviders(<AppRoutes />, { route: '/chat/not a chat' });
    expect(
      screen.getByRole('heading', { level: 1, name: 'This chat doesn’t exist.' }),
    ).toBeInTheDocument();
  });

  it('shows "Not found" for a chat that does not exist', async () => {
    renderWithProviders(<AppRoutes />, { route: '/chat/0f6c2b1e-1d2a-4c3b-9e8f-7a6b5c4d3e2f' });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'This chat doesn’t exist.' }),
    ).toBeInTheDocument();
  });

  it('redirects unknown routes home', () => {
    renderWithProviders(<AppRoutes />, { route: '/nowhere' });
    expect(screen.getByRole('heading', { level: 1, name: APP_NAME })).toBeInTheDocument();
  });
});

describe('AppRoutes: settings and chat info (§12.3)', () => {
  it('renders Settings', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(new Response('[]')));
    renderWithProviders(<AppRoutes />, { route: '/settings' });
    expect(await screen.findByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it('renders Chat info, with "Not found" for an invalid id', async () => {
    renderWithProviders(<AppRoutes />, { route: '/chat/not a chat/info' });
    expect(await screen.findByRole('alert')).toHaveTextContent('This chat doesn’t exist.');
  });
});
