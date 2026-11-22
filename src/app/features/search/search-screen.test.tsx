import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Route, Routes, useLocation } from 'react-router';
import { renderWithProviders } from '../../test/providers';
import { CHAT_ID, chatSummary, participant, SARA, searchHit } from '../../test/fixtures';
import { SearchScreen } from './search-screen';

const db = vi.hoisted(() => ({
  search: vi.fn(),
  listChats: vi.fn(),
  getParticipants: vi.fn(),
}));

vi.mock('../../../client/db-client', () => ({ dbClient: db }));

function ChatProbe() {
  const location = useLocation();
  return <p>{`chat ${location.pathname}${location.search}`}</p>;
}

function renderSearch(route = '/search') {
  return renderWithProviders(
    <Routes>
      <Route path="/search" element={<SearchScreen />} />
      <Route path="/chat/:chatId" element={<ChatProbe />} />
    </Routes>,
    { route },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  db.listChats.mockResolvedValue([chatSummary()]);
  db.getParticipants.mockResolvedValue([participant()]);
  db.search.mockResolvedValue({ hits: [searchHit()], nextCursor: null });
});

describe('SearchScreen (§11)', () => {
  it('focuses the heading and runs the query from the URL', async () => {
    renderSearch('/search?q=trip');
    expect(await screen.findByRole('heading', { level: 1, name: 'Search' })).toHaveFocus();
    expect(screen.getByRole('searchbox', { name: 'Search messages' })).toHaveValue('trip');
    const link = await screen.findByRole('link', { name: /^Family.*Sara.*the trip/u });
    expect(within(link).getByText('trip', { selector: 'mark' })).toBeInTheDocument();
    expect(db.search).toHaveBeenCalledWith({
      query: 'trip',
      chatId: null,
      authorId: null,
      kinds: null,
      dateFromTsKey: null,
      dateToTsKey: null,
      limit: 50,
      cursor: null,
    });
    expect(screen.getByRole('status')).toHaveTextContent('1 results');
  });

  it('opens the chat at the hit', async () => {
    const user = userEvent.setup();
    renderSearch('/search?q=trip');
    await user.click(await screen.findByRole('link', { name: /^Family.*Sara/u }));
    expect(screen.getByText(`chat /chat/${CHAT_ID}?seq=4`)).toBeInTheDocument();
  });

  it('asks for 3 characters across all chats, and allows short in-chat queries', async () => {
    const user = userEvent.setup();
    renderSearch();
    await user.type(screen.getByRole('searchbox'), 'ab');
    expect(
      await screen.findByText('Type at least 3 characters to search all chats.'),
    ).toBeInTheDocument();
    expect(db.search).not.toHaveBeenCalled();
    await user.click(screen.getByText('Filters'));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Chat' }), CHAT_ID);
    await waitFor(() => {
      expect(db.search).toHaveBeenCalledWith(
        expect.objectContaining({ query: 'ab', chatId: CHAT_ID }),
      );
    });
    expect(await screen.findByText(/Short searches show at most 500 results/u)).toBeInTheDocument();
  });

  it('passes sender, kind and date filters', async () => {
    const user = userEvent.setup();
    renderSearch('/search?q=trip');
    await screen.findByRole('link', { name: /^Family/u });
    await user.click(screen.getByText('Filters'));
    expect(screen.getByText('Choose a chat to filter by sender.')).toBeInTheDocument();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Chat' }), CHAT_ID);
    await user.selectOptions(await screen.findByRole('combobox', { name: 'Sender' }), SARA);
    await user.click(screen.getByRole('checkbox', { name: 'Media' }));
    // happy-dom does not type into date inputs; set the value directly.
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-11-01' } });
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-11-30' } });
    await waitFor(() => {
      expect(db.search).toHaveBeenLastCalledWith(
        expect.objectContaining({
          chatId: CHAT_ID,
          authorId: SARA,
          kinds: ['media'],
          dateFromTsKey: Date.UTC(2026, 10, 1) / 1000,
          dateToTsKey: Date.UTC(2026, 11, 1) / 1000 - 1,
        }),
      );
    });
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    // The unfiltered results are still cached: no new request, controls reset.
    expect(screen.getByRole('combobox', { name: 'Chat' })).toHaveValue('');
    expect(screen.getByRole('checkbox', { name: 'Media' })).not.toBeChecked();
    expect(screen.getByLabelText('From')).toHaveValue('');
    expect(await screen.findByRole('link', { name: /^Family/u })).toBeInTheDocument();
  });

  it('pages with "Show more" and reports empty and failed searches', async () => {
    const cursor = { tsKey: 1, rowId: 5, seq: 4 };
    db.search
      .mockResolvedValueOnce({ hits: [searchHit()], nextCursor: cursor })
      .mockResolvedValueOnce({
        hits: [searchHit({ messageRowId: 9, seq: 8, snippet: 'another trip' })],
        nextCursor: null,
      });
    const user = userEvent.setup();
    const view = renderSearch('/search?q=trip');
    expect(await screen.findByText('1+ results')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Show more results' }));
    expect(await screen.findByText('2 results')).toBeInTheDocument();
    expect(db.search).toHaveBeenLastCalledWith(expect.objectContaining({ cursor }));
    view.unmount();

    db.search.mockResolvedValue({ hits: [], nextCursor: null });
    const empty = renderSearch('/search?q=zzz');
    expect(await screen.findByText('No messages match “zzz”.')).toBeInTheDocument();
    empty.unmount();

    db.search.mockRejectedValue(new Error('boom'));
    renderSearch('/search?q=trip');
    expect(await screen.findByRole('alert')).toHaveTextContent('Search failed. Try again.');
  });
});
