import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Route, Routes, useLocation } from 'react-router';
import { renderWithProviders } from '../../test/providers';
import { bookmarkView, CHAT_ID, chatSummary } from '../../test/fixtures';
import { BookmarksScreen } from './bookmarks-screen';

const db = vi.hoisted(() => ({
  listBookmarks: vi.fn(),
  listChats: vi.fn(),
  updateBookmark: vi.fn(),
  removeBookmark: vi.fn(),
}));

vi.mock('../../../client/db-client', () => ({ dbClient: db }));

function ChatProbe() {
  const location = useLocation();
  return <p>{`chat ${location.pathname}${location.search}`}</p>;
}

function renderBookmarks() {
  return renderWithProviders(
    <Routes>
      <Route path="/bookmarks" element={<BookmarksScreen />} />
      <Route path="/chat/:chatId" element={<ChatProbe />} />
    </Routes>,
    { route: '/bookmarks' },
  );
}

const first = bookmarkView({ note: 'flight details', message: { seq: 7, body: 'Gate 12 at 9' } });
const second = bookmarkView({
  message: { seq: 2, body: '', kind: 'media', authorName: null, authorId: null },
});

beforeEach(() => {
  vi.clearAllMocks();
  db.listBookmarks.mockResolvedValue([first, second]);
  db.listChats.mockResolvedValue([chatSummary()]);
  db.updateBookmark.mockResolvedValue(undefined);
  db.removeBookmark.mockResolvedValue(undefined);
});

describe('BookmarksScreen', () => {
  it('lists bookmarks with chat, sender, text and note', async () => {
    renderBookmarks();
    expect(await screen.findByRole('heading', { level: 1, name: 'Bookmarks' })).toHaveFocus();
    const items = await screen.findAllByRole('listitem');
    expect(items).toHaveLength(2);
    const [withNote, media] = items;
    if (withNote === undefined || media === undefined) return;
    expect(within(withNote).getByText('Family')).toBeInTheDocument();
    expect(within(withNote).getByText('Sara')).toBeInTheDocument();
    expect(within(withNote).getByText('Gate 12 at 9')).toBeInTheDocument();
    expect(within(withNote).getByText('flight details')).toBeInTheDocument();
    expect(within(media).getByText('Media')).toBeInTheDocument();
    expect(within(media).getByText('System')).toBeInTheDocument();
    expect(within(media).getByRole('button', { name: 'Add note' })).toBeInTheDocument();
    expect(db.listBookmarks).toHaveBeenCalledWith(null);
  });

  it('shows a bookmark in its chat', async () => {
    const user = userEvent.setup();
    renderBookmarks();
    const [item] = await screen.findAllByRole('listitem');
    if (item === undefined) return;
    await user.click(within(item).getByRole('link', { name: 'Show in chat' }));
    expect(screen.getByText(`chat /chat/${CHAT_ID}?seq=7`)).toBeInTheDocument();
  });

  it('edits and clears a note', async () => {
    const user = userEvent.setup();
    renderBookmarks();
    const [item] = await screen.findAllByRole('listitem');
    if (item === undefined) return;
    await user.click(within(item).getByRole('button', { name: 'Edit note' }));
    const sheet = screen.getByRole('dialog', { name: 'Bookmark note' });
    const field = within(sheet).getByRole('textbox', { name: 'Note (optional)' });
    expect(field).toHaveValue('flight details');
    await user.clear(field);
    await user.type(field, '  new note  ');
    await user.click(within(sheet).getByRole('button', { name: 'Save' }));
    expect(db.updateBookmark).toHaveBeenCalledWith('bm-7', 'new note');
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    await user.click(within(item).getByRole('button', { name: 'Edit note' }));
    await user.clear(screen.getByRole('textbox', { name: 'Note (optional)' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(db.updateBookmark).toHaveBeenLastCalledWith('bm-7', null);
  });

  it('removes a bookmark and refreshes the list', async () => {
    const user = userEvent.setup();
    renderBookmarks();
    await screen.findAllByRole('listitem');
    db.listBookmarks.mockResolvedValue([second]);
    await user.click(screen.getByRole('button', { name: 'Remove bookmark: Gate 12 at 9' }));
    expect(db.removeBookmark).toHaveBeenCalledWith('bm-7');
    await waitFor(() => {
      expect(screen.getAllByRole('listitem')).toHaveLength(1);
    });
  });

  it('shows the empty and failed states', async () => {
    db.listBookmarks.mockResolvedValue([]);
    const view = renderBookmarks();
    expect(await screen.findByText('No bookmarks yet')).toBeInTheDocument();
    view.unmount();
    db.listBookmarks.mockRejectedValue(new Error('boom'));
    renderBookmarks();
    expect(await screen.findByRole('alert')).toHaveTextContent('Bookmarks could not be loaded.');
  });
});
