import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/providers';
import { attachment } from '../../test/fixtures';
import { ContactCard } from './contact-card';

const readStoredFile = vi.hoisted(() => vi.fn());

vi.mock('../../../client/db-client', () => ({
  dbClient: { readContactName: () => Promise.resolve('Ali Khan') },
}));

vi.mock('../../../platform/media-url', () => ({
  readStoredFile: (path: string) => readStoredFile(path) as Promise<File | null>,
}));

const card = attachment({
  mediaType: 'contact-card',
  fileName: 'Ali.vcf',
  thumbPath: null,
  opfsPath: 'media/c/att-1.vcf',
});

afterEach(() => {
  Reflect.deleteProperty(navigator, 'share');
  Reflect.deleteProperty(navigator, 'canShare');
  vi.restoreAllMocks();
});

describe('ContactCard', () => {
  it('shares the stored card through the share sheet when files can be shared', async () => {
    const share = vi.fn<(data: ShareData) => Promise<void>>(() => Promise.resolve());
    Object.defineProperty(navigator, 'share', { configurable: true, value: share });
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
    readStoredFile.mockResolvedValue(new File(['BEGIN:VCARD'], 'att-1.vcf'));
    const user = userEvent.setup();
    renderWithProviders(<ContactCard messageRowId={1} attachment={card} />);
    expect(await screen.findByText('Ali Khan')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Share contact' }));
    await waitFor(() => {
      expect(share).toHaveBeenCalledTimes(1);
    });
    const shared = share.mock.calls[0]?.[0].files?.[0];
    expect(shared?.name).toBe('Ali.vcf');
    expect(readStoredFile).toHaveBeenCalledWith('media/c/att-1.vcf');
  });

  it('saves the card as a download without share support', async () => {
    readStoredFile.mockResolvedValue(new File(['BEGIN:VCARD'], 'att-1.vcf'));
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:card');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const user = userEvent.setup();
    renderWithProviders(<ContactCard messageRowId={1} attachment={card} />);
    await user.click(await screen.findByRole('button', { name: 'Save contact' }));
    await waitFor(() => {
      expect(click).toHaveBeenCalledTimes(1);
    });
    expect(create).toHaveBeenCalledTimes(1);
    expect(revoke).toHaveBeenCalledWith('blob:card');
  });

  it('re-enables the button when the card file is gone', async () => {
    readStoredFile.mockResolvedValue(null);
    const user = userEvent.setup();
    renderWithProviders(<ContactCard messageRowId={1} attachment={card} />);
    const button = await screen.findByRole('button', { name: 'Save contact' });
    await user.click(button);
    await waitFor(() => {
      expect(button).toBeEnabled();
    });
  });
});
