import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Route, Routes, useLocation } from 'react-router';
import { asAttachmentId } from '../../../core/ids';
import { renderWithProviders } from '../../test/providers';
import { attachment, CHAT_ID, chat } from '../../test/fixtures';
import { stubDivLayout } from '../../test/layout-stub';
import type { GalleryItemView, LinkMessageView } from '../../../client/db-client';
import { MediaScreen } from './media-screen';

const db = vi.hoisted(() => ({
  getChat: vi.fn(),
  listAttachments: vi.fn(),
  listLinks: vi.fn(),
  saveVideoThumbnail: vi.fn(),
}));

vi.mock('../../../client/db-client', () => ({ dbClient: db }));
vi.mock('../../../platform/media-url', () => ({
  mediaUrlCache: { get: () => undefined, put: () => 'blob:thumb' },
  readStoredFile: () => Promise.resolve(new Blob(['x'])),
}));

const NOV = { year: 2026, month: 11, day: 17, hour: 21, minute: 20, second: 0 };
const OCT = { ...NOV, month: 10 };

function item(index: number, over: Partial<GalleryItemView['attachment']> = {}): GalleryItemView {
  return {
    attachment: attachment({ id: asAttachmentId(`att-${String(index)}`), ...over }),
    message: {
      messageRowId: index,
      seq: index,
      tsLocal: index > 1 ? NOV : OCT,
      authorName: 'Sara',
    },
  };
}

function Probe() {
  const location = useLocation();
  return <p>{`at ${location.pathname}${location.search}`}</p>;
}

function renderMedia(route: string) {
  return renderWithProviders(
    <Routes>
      <Route path="/chat/:chatId/media" element={<MediaScreen />} />
      <Route path="/chat/:chatId" element={<Probe />} />
    </Routes>,
    { route },
  );
}

let restoreLayout: () => void = () => undefined;

beforeEach(() => {
  vi.clearAllMocks();
  restoreLayout = stubDivLayout();
  db.getChat.mockResolvedValue(chat());
  db.listAttachments.mockResolvedValue({ items: [item(3), item(2), item(1)], nextCursor: null });
  db.listLinks.mockResolvedValue({ messages: [], nextCursor: null });
});

afterEach(() => {
  restoreLayout();
});

describe('MediaScreen', () => {
  it('shows photos grouped by month and focuses the heading', async () => {
    renderMedia(`/chat/${CHAT_ID}/media`);
    expect(await screen.findByRole('heading', { level: 1, name: 'Media' })).toHaveFocus();
    expect(await screen.findByRole('heading', { name: 'November 2026' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'October 2026' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^Photo, Sara/u })).toHaveLength(3);
    expect(screen.getByRole('link', { name: 'Photos' })).toHaveAttribute('aria-current', 'page');
    expect(db.listAttachments).toHaveBeenCalledWith({
      chatId: CHAT_ID,
      types: ['image', 'sticker', 'gif'],
      cursor: null,
      limit: 120,
    });
  });

  it('switches tabs through ?tab= and lists documents as rows', async () => {
    const user = userEvent.setup();
    db.listAttachments.mockResolvedValue({
      items: [item(2, { mediaType: 'document', fileName: 'report.pdf', byteSize: 5120 })],
      nextCursor: null,
    });
    renderMedia(`/chat/${CHAT_ID}/media`);
    await user.click(await screen.findByRole('link', { name: 'Documents' }));
    expect(await screen.findByText('report.pdf')).toBeInTheDocument();
    expect(screen.getByText('5 KB')).toBeInTheDocument();
    expect(db.listAttachments).toHaveBeenLastCalledWith(
      expect.objectContaining({ types: ['document', 'contact-card', 'other'] }),
    );
  });

  it('opens the viewer, pages with the buttons and shows the item in chat', async () => {
    const user = userEvent.setup();
    renderMedia(`/chat/${CHAT_ID}/media?tab=photos`);
    const tiles = await screen.findAllByRole('button', { name: /^Photo, Sara/u });
    const firstTile = tiles[0];
    if (firstTile === undefined) return;
    await user.click(firstTile);
    const dialog = await screen.findByRole('dialog', { name: 'Photo 1 of 3' });
    expect(within(dialog).getByRole('button', { name: 'Previous' })).toBeDisabled();
    await user.click(within(dialog).getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('dialog', { name: 'Photo 2 of 3' })).toBeInTheDocument();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('dialog', { name: 'Photo 3 of 3' })).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Show in chat' }));
    expect(await screen.findByText(`at /chat/${CHAT_ID}?seq=1`)).toBeInTheDocument();
  });

  it('lists links with their domain and message', async () => {
    const link: LinkMessageView = {
      messageRowId: 9,
      seq: 9,
      tsLocal: NOV,
      authorName: 'Ali Khan',
      chatId: CHAT_ID,
      body: 'Tickets at https://tickets.example.com/a ok',
    };
    db.listLinks.mockResolvedValue({ messages: [link], nextCursor: null });
    renderMedia(`/chat/${CHAT_ID}/media?tab=links`);
    expect(await screen.findByText('tickets.example.com')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /tickets\.example\.com/u })).toHaveAttribute(
      'rel',
      'noopener noreferrer',
    );
    expect(screen.getByRole('link', { name: 'Show in chat' })).toHaveAttribute(
      'href',
      `/chat/${CHAT_ID}?seq=9`,
    );
  });

  it('loads the next page when the viewer reaches the last loaded item', async () => {
    const user = userEvent.setup();
    db.listAttachments
      .mockResolvedValueOnce({ items: [item(3), item(2)], nextCursor: 2 })
      .mockResolvedValueOnce({ items: [item(1)], nextCursor: null });
    renderMedia(`/chat/${CHAT_ID}/media`);
    const tiles = await screen.findAllByRole('button', { name: /^Photo, Sara/u });
    const lastTile = tiles.at(-1);
    if (lastTile === undefined) return;
    await user.click(lastTile);
    expect(await screen.findByRole('dialog', { name: /^Photo 2 of 3$/u })).toBeInTheDocument();
    expect(db.listAttachments).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: 2 }));
  });

  it('shows the empty state of a tab', async () => {
    db.listAttachments.mockResolvedValue({ items: [], nextCursor: null });
    renderMedia(`/chat/${CHAT_ID}/media?tab=videos`);
    expect(await screen.findByText('No videos in this chat.')).toBeInTheDocument();
  });

  it('shows Not found for an invalid chat id and an unknown chat', async () => {
    renderMedia('/chat/not*valid/media');
    expect(screen.getByRole('alert')).toHaveTextContent('This chat doesn’t exist.');
    db.getChat.mockResolvedValue(null);
    renderMedia(`/chat/${CHAT_ID}/media`);
    await waitFor(() => {
      expect(screen.getAllByRole('alert')).toHaveLength(2);
    });
  });
});
