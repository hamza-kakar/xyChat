import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/providers';
import { attachment, message } from '../../test/fixtures';
import { MessageContent } from './message-content';
import { OpenMediaContext } from './open-media-context';

const readContactName = vi.hoisted(() => vi.fn());

vi.mock('../../../client/db-client', () => ({
  dbClient: { readContactName: (id: number) => readContactName(id) as Promise<string | null> },
}));

vi.mock('../../../platform/media-url', () => ({
  mediaUrlCache: { get: () => 'blob:thumb', put: () => 'blob:thumb' },
  readStoredFile: () => Promise.resolve(null),
}));

describe('MessageContent (§12.5)', () => {
  it('shows the deleted placeholder from the UI strings', () => {
    renderWithProviders(
      <MessageContent message={message({ kind: 'deleted', body: 'This message was deleted.' })} />,
    );
    expect(screen.getByText('This message was deleted')).toHaveClass('italic');
  });

  it('enlarges one to three emoji', () => {
    const { container } = renderWithProviders(
      <MessageContent message={message({ body: '🎉🎉' })} />,
    );
    expect(container.querySelector('.text-4xl')).not.toBeNull();
  });

  it('shows a location with coordinates and a maps link, without tiles', () => {
    renderWithProviders(
      <MessageContent
        message={message({
          kind: 'location',
          location: {
            lat: 24.8607,
            lng: 67.0011,
            url: 'https://maps.google.com/?q=24.8607,67.0011',
          },
        })}
      />,
    );
    expect(screen.getByText('24.860700, 67.001100')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open in Maps' })).toHaveAttribute(
      'href',
      'https://maps.apple.com/?ll=24.860700,67.001100',
    );
    expect(document.querySelector('img')).toBeNull();
  });

  it('falls back to text for a location or poll without parsed data', () => {
    renderWithProviders(
      <MessageContent message={message({ kind: 'location', body: 'location: somewhere' })} />,
    );
    expect(screen.getByText('location: somewhere')).toBeInTheDocument();
  });

  it('shows a poll with its options and vote counts', () => {
    renderWithProviders(
      <MessageContent
        message={message({
          kind: 'poll',
          poll: {
            question: 'Dinner?',
            options: [
              { text: 'Biryani', votes: 2 },
              { text: 'Karahi', votes: 1 },
              { text: 'Later', votes: null },
            ],
          },
        })}
      />,
    );
    expect(screen.getByText('Dinner?')).toBeInTheDocument();
    expect(screen.getByText('2 votes')).toBeInTheDocument();
    expect(screen.getByText('1 vote')).toBeInTheDocument();
    expect(screen.getByText('Later')).toBeInTheDocument();
  });
});

describe('MessageContent media (§12.5, §13.1)', () => {
  it('shows placeholders for omitted and missing media', () => {
    renderWithProviders(
      <MessageContent
        message={message({
          kind: 'media',
          body: '',
          attachments: [attachment({ status: 'omitted', opfsPath: null, thumbPath: null })],
        })}
      />,
    );
    expect(screen.getByText('Media not included in export')).toBeInTheDocument();
    renderWithProviders(
      <MessageContent
        message={message({
          kind: 'media',
          body: '',
          attachments: [
            attachment({ mediaType: 'video', status: 'missing', opfsPath: null, thumbPath: null }),
          ],
        })}
      />,
    );
    expect(screen.getByText('Media file not found in archive')).toBeInTheDocument();
    expect(screen.getByText('Video')).toBeInTheDocument();
  });

  it('shows a stored photo thumbnail with reserved space and its caption', () => {
    renderWithProviders(
      <MessageContent
        message={message({ kind: 'media', body: 'sunset', attachments: [attachment()] })}
      />,
    );
    const image = screen.getByRole('img', { name: 'Photo' });
    expect(image).toHaveAttribute('src', 'blob:thumb');
    expect(image.parentElement).toHaveStyle({ aspectRatio: '640 / 480' });
    expect(screen.getByText('sunset')).toBeInTheDocument();
  });

  it('shows a stored sticker at a fixed 160 px box without bubble chrome', () => {
    renderWithProviders(
      <MessageContent
        message={message({
          kind: 'media',
          attachments: [
            attachment({ mediaType: 'sticker', opfsPath: 'media/c/s.webp', thumbPath: null }),
          ],
        })}
      />,
    );
    const image = screen.getByRole('img', { name: 'Sticker' });
    expect(image.parentElement).toHaveClass('w-40', 'max-w-full');
  });

  it('plays voice notes in place with the player controls (§13.2)', () => {
    renderWithProviders(
      <MessageContent
        message={message({
          kind: 'media',
          body: '',
          attachments: [attachment({ mediaType: 'voice', thumbPath: null, durationMs: 65_000 })],
        })}
      />,
    );
    expect(screen.getByRole('button', { name: 'Play Voice note' })).toBeEnabled();
    expect(screen.getByRole('slider', { name: 'Position' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Playback speed 1×' })).toBeInTheDocument();
    expect(screen.getByText('0:00 / 1:05')).toBeInTheDocument();
  });

  it('asks the chat view to open a document in the viewer', async () => {
    const user = userEvent.setup();
    const openMedia = vi.fn();
    const doc = attachment({
      mediaType: 'document',
      fileName: 'report.pdf',
      thumbPath: null,
      byteSize: 5120,
    });
    const docMessage = message({ kind: 'media', body: '', attachments: [doc] });
    renderWithProviders(
      <OpenMediaContext value={openMedia}>
        <MessageContent message={docMessage} />
      </OpenMediaContext>,
    );
    expect(screen.getByText('report.pdf')).toBeInTheDocument();
    expect(screen.getByText('5 KB')).toBeInTheDocument();
    // The visible name and size are part of the button's name (WCAG 2.5.3).
    await user.click(screen.getByRole('button', { name: 'Open report.pdf 5 KB' }));
    expect(openMedia).toHaveBeenCalledWith(docMessage, doc);
  });

  it('shows a plain preview outside a chat view', () => {
    renderWithProviders(
      <MessageContent
        message={message({ kind: 'media', body: '', attachments: [attachment()] })}
      />,
    );
    expect(screen.getByRole('img', { name: 'Photo' })).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('shows a contact card with the name read from its .vcf', async () => {
    readContactName.mockResolvedValue('Ali Khan');
    renderWithProviders(
      <MessageContent
        message={message({
          kind: 'contact',
          body: '',
          attachments: [
            attachment({ mediaType: 'contact-card', fileName: 'Ali.vcf', thumbPath: null }),
          ],
        })}
      />,
    );
    expect(await screen.findByText('Ali Khan')).toBeInTheDocument();
    expect(readContactName).toHaveBeenCalledWith(1);
    expect(screen.getByRole('button', { name: /contact/u })).toBeInTheDocument();
  });

  it('does not read a contact card that is not stored', () => {
    readContactName.mockClear();
    renderWithProviders(
      <MessageContent
        message={message({
          kind: 'contact',
          body: '',
          attachments: [
            attachment({
              mediaType: 'contact-card',
              status: 'missing',
              opfsPath: null,
              fileName: 'Ali.vcf',
            }),
          ],
        })}
      />,
    );
    expect(screen.getByText('Ali.vcf')).toBeInTheDocument();
    expect(readContactName).not.toHaveBeenCalled();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
