import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/providers';
import { attachment, CHAT_ID } from '../../test/fixtures';
import { MediaViewer, type ViewerItem } from './media-viewer';

vi.mock('../../../platform/media-url', () => ({
  mediaUrlCache: { get: () => undefined, put: () => 'blob:file' },
  readStoredFile: vi.fn(() => Promise.resolve(null)),
}));

const NOV = { year: 2026, month: 11, day: 17, hour: 21, minute: 20, second: 0 };

function viewerItem(over: Partial<ViewerItem['attachment']>): ViewerItem {
  return { attachment: attachment(over), message: { seq: 4, tsLocal: NOV, authorName: 'Sara' } };
}

describe('MediaViewer', () => {
  it('shows a document with its size and says when the file is gone', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <MediaViewer
        chatId={CHAT_ID}
        items={[viewerItem({ mediaType: 'document', fileName: 'report.pdf', byteSize: 5120 })]}
        index={0}
        onIndexChange={vi.fn()}
        onClose={onClose}
        showInChat={false}
      />,
    );
    const dialog = screen.getByRole('dialog', { name: 'Document' });
    expect(dialog).toHaveTextContent('report.pdf');
    expect(dialog).toHaveTextContent('5 KB');
    expect(dialog).toHaveTextContent('Sara');
    expect(screen.queryByRole('link', { name: 'Show in chat' })).toBeNull();
    expect(await screen.findByRole('alert')).toHaveTextContent('This file could not be opened.');
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows the player for a voice note and a missing video as failed', () => {
    renderWithProviders(
      <MediaViewer
        chatId={CHAT_ID}
        items={[
          viewerItem({ mediaType: 'voice', thumbPath: null }),
          viewerItem({ mediaType: 'video', opfsPath: null }),
        ]}
        index={0}
        onIndexChange={vi.fn()}
        onClose={vi.fn()}
        showInChat
      />,
    );
    expect(screen.getByRole('dialog', { name: 'Voice note 1 of 2' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play Voice note' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Show in chat' })).toHaveAttribute(
      'href',
      `/chat/${CHAT_ID}?seq=4`,
    );
  });
});
