import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { APP_NAME } from '../../config';
import { HomeScreen } from './home-screen';

describe('HomeScreen', () => {
  it('renders the app name as the page heading', () => {
    render(
      <MemoryRouter>
        <HomeScreen />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { level: 1, name: APP_NAME })).toBeInTheDocument();
  });

  it('renders the tagline', () => {
    render(
      <MemoryRouter>
        <HomeScreen />
      </MemoryRouter>,
    );
    expect(screen.getByText('Your chats, kept private on this device.')).toBeInTheDocument();
  });
});
