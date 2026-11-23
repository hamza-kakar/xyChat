import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { InstallBanner } from './install-banner';

const install = vi.hoisted(() => ({ standalone: false, ios: true }));

vi.mock('../../../platform/install', () => ({
  isStandalone: () => install.standalone,
  isIosSafari: () => install.ios,
}));

describe('InstallBanner', () => {
  it('shows in an iOS Safari tab and can be dismissed', async () => {
    const user = userEvent.setup();
    render(<InstallBanner />);
    expect(screen.getByText(/Install xyChat to your Home Screen/u)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText(/Install xyChat/u)).toBeNull();
  });

  it('stays hidden when installed or not on iOS Safari', () => {
    install.standalone = true;
    const { unmount } = render(<InstallBanner />);
    expect(screen.queryByText(/Install xyChat/u)).toBeNull();
    unmount();
    install.standalone = false;
    install.ios = false;
    render(<InstallBanner />);
    expect(screen.queryByText(/Install xyChat/u)).toBeNull();
  });
});
