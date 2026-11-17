import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { APP_NAME } from '../../config';
import { HomeScreen } from './home-screen';

describe('HomeScreen', () => {
  it('renders the app name as the page heading', () => {
    render(<HomeScreen />);
    expect(screen.getByRole('heading', { level: 1, name: APP_NAME })).toBeInTheDocument();
  });

  it('renders the tagline', () => {
    render(<HomeScreen />);
    expect(screen.getByText('Your chats, kept private on this device.')).toBeInTheDocument();
  });
});
