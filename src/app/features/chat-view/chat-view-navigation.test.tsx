import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Route, Routes } from 'react-router';
import { renderWithProviders } from '../../test/providers';
import { stubDivLayout } from '../../test/layout-stub';
import { bookmarkView, chat, CHAT_ID, message, participant } from '../../test/fixtures';
import { dayNumber } from '../../../core/dates';
import { ChatViewScreen } from './chat-view-screen';

const db = vi.hoisted(() => ({
  getChat: vi.fn(),
  getParticipants: vi.fn(),
  getMessageWindow: vi.fn(),
  getLastChatPosition: vi.fn(),
  setLastChatPosition: vi.fn(),
  listImports: vi.fn(),
  readContactName: vi.fn(),
  listBookmarks: vi.fn(),
  addBookmark: vi.fn(),
  removeBookmark: vi.fn(),
  updateBookmark: vi.fn(),
  listMatchingSeqs: vi.fn(),
  listMessageDays: vi.fn(),
  findSeqByDate: vi.fn(),
}));

vi.mock('../../../client/db-client', () => ({ dbClient: db }));

const FIRST_KEY = Date.UTC(2026, 10, 17, 21, 19, 3) / 1000;
const LAST_KEY = Date.UTC(2026, 10, 18, 9, 0, 0) / 1000;
const messages = [
  message({ seq: 0, body: 'hello there' }),
  message({ seq: 1, body: 'hello again' }),
  message({ seq: 2, body: 'hello once more' }),
];

let restoreLayout: () => void = () => undefined;

beforeEach(() => {
  restoreLayout = stubDivLayout();
  vi.clearAllMocks();
  db.getChat.mockResolvedValue(
    chat({ selfParticipantId: participant().id, firstTsKey: FIRST_KEY, lastTsKey: LAST_KEY }),
  );
  db.getParticipants.mockResolvedValue([participant()]);
  db.getMessageWindow.mockResolvedValue({ messages, hasBefore: false, hasAfter: false });
  db.getLastChatPosition.mockResolvedValue(null);
  db.setLastChatPosition.mockResolvedValue(undefined);
  db.listImports.mockResolvedValue([]);
  db.listBookmarks.mockResolvedValue([]);
  db.addBookmark.mockResolvedValue('bm-new');
  db.removeBookmark.mockResolvedValue(undefined);
  db.listMatchingSeqs.mockResolvedValue({ seqs: [0, 1, 2], isCapped: false });
  db.listMessageDays.mockResolvedValue([dayNumber({ year: 2026, month: 11, day: 17 })]);
  db.findSeqByDate.mockResolvedValue(1);
});

afterEach(() => {
  restoreLayout();
});

function renderChat(query = '') {
  return renderWithProviders(
    <Routes>
      <Route path="/chat/:chatId" element={<ChatViewScreen />} />
    </Routes>,
    { route: `/chat/${CHAT_ID}${query}` },
  );
}

function highlighted(): HTMLElement | null {
  return screen.getByRole('log').querySelector('[aria-current="true"]');
}

describe('in-chat search', () => {
  it('counts matches, starts at the newest and steps with previous/next', async () => {
    const user = userEvent.setup();
    renderChat();
    await screen.findByText('hello there');
    await user.click(screen.getByRole('button', { name: 'Search in chat' }));
    const field = screen.getByRole('searchbox', { name: 'Search in this chat' });
    expect(field).toHaveFocus();
    await user.type(field, 'hello');
    expect(await screen.findByText('3 of 3')).toBeInTheDocument();
    expect(db.listMatchingSeqs).toHaveBeenCalledWith(
      expect.objectContaining({ chatId: CHAT_ID, query: 'hello' }),
    );
    expect(highlighted()).toHaveAttribute('data-seq', '2');
    expect(screen.getByRole('button', { name: 'Next match (newer)' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Previous match (older)' }));
    expect(screen.getByText('2 of 3')).toBeInTheDocument();
    expect(highlighted()).toHaveAttribute('data-seq', '1');
    await user.type(field, '{Enter}');
    expect(screen.getByText('1 of 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous match (older)' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Next match (newer)' }));
    expect(screen.getByText('2 of 3')).toBeInTheDocument();
  });

  it('opens from ?q=, reports no matches and short-query limits, and closes on Escape', async () => {
    db.listMatchingSeqs.mockResolvedValue({ seqs: [], isCapped: false });
    const user = userEvent.setup();
    renderChat('?q=zz');
    const field = await screen.findByRole('searchbox', { name: 'Search in this chat' });
    expect(field).toHaveValue('zz');
    // Opened by the link, not the user: focus stays on the page heading.
    expect(screen.getByRole('heading', { level: 1, name: 'Family' })).toHaveFocus();
    expect(await screen.findByText('No matches')).toBeInTheDocument();
    expect(screen.getByText('Short searches show at most 500 matches.')).toBeInTheDocument();
    await user.type(field, '{Escape}');
    expect(screen.queryByRole('searchbox')).toBeNull();
    expect(screen.getByRole('button', { name: 'Search in chat' })).toHaveFocus();
  });

  it('shows a capped count with a plus', async () => {
    db.listMatchingSeqs.mockResolvedValue({ seqs: [0, 1], isCapped: true });
    renderChat('?q=hello');
    expect(await screen.findByText('2 of 2+')).toBeInTheDocument();
  });
});

describe('linked messages and jump to date', () => {
  it('highlights the message linked by ?seq=', async () => {
    renderChat('?seq=1');
    await screen.findByText('hello again');
    expect(highlighted()).toHaveAttribute('data-seq', '1');
  });

  it('marks days with messages and jumps to the picked day', async () => {
    const user = userEvent.setup();
    renderChat();
    await screen.findByText('hello there');
    await user.click(screen.getByRole('button', { name: 'Jump to date' }));
    const sheet = screen.getByRole('dialog', { name: 'Jump to date' });
    expect(within(sheet).getByText('November 2026')).toBeInTheDocument();
    expect(within(sheet).getByRole('button', { name: 'Previous month' })).toBeDisabled();
    expect(within(sheet).getByRole('button', { name: 'Next month' })).toBeDisabled();
    expect(
      within(sheet).getByRole('button', { name: 'Wednesday, November 18, 2026' }),
    ).toBeDisabled();
    await user.click(
      await within(sheet).findByRole('button', {
        name: 'Tuesday, November 17, 2026, has messages',
      }),
    );
    expect(db.findSeqByDate).toHaveBeenCalledWith(CHAT_ID, {
      year: 2026,
      month: 11,
      day: 17,
      hour: 0,
      minute: 0,
      second: 0,
    });
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(highlighted()).toHaveAttribute('data-seq', '1');
  });

  it('jumps to the first and last message', async () => {
    const user = userEvent.setup();
    renderChat();
    await screen.findByText('hello there');
    await user.click(screen.getByRole('button', { name: 'Jump to date' }));
    await user.click(screen.getByRole('button', { name: 'First message' }));
    expect(highlighted()).toHaveAttribute('data-seq', '0');
    await user.click(screen.getByRole('button', { name: 'Jump to date' }));
    await user.click(screen.getByRole('button', { name: 'Last message' }));
    expect(highlighted()).toHaveAttribute('data-seq', '2');
  });

  it('disables search and jump for an empty chat', async () => {
    db.getChat.mockResolvedValue(chat({ messageCount: 0 }));
    renderChat();
    expect(await screen.findByRole('button', { name: 'Search in chat' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Jump to date' })).toBeDisabled();
  });

  it('offers a jump to the latest message with the count below', async () => {
    const total = 1000;
    db.getChat.mockResolvedValue(
      chat({ messageCount: total, firstTsKey: FIRST_KEY, lastTsKey: LAST_KEY }),
    );
    db.getMessageWindow.mockImplementation(({ anchorSeq }: { readonly anchorSeq: number }) =>
      Promise.resolve({
        messages: Array.from({ length: 300 }, (_unused, index) =>
          message({ seq: anchorSeq + index, body: `row ${String(anchorSeq + index)}` }),
        ).filter((item) => item.seq < total),
        hasBefore: false,
        hasAfter: false,
      }),
    );
    renderChat('?seq=0');
    const button = await screen.findByRole('button', {
      name: /^Jump to the latest message, \d+ below$/u,
    });
    expect(within(button).getByText(/^\d+\+?$/u)).toBeInTheDocument();
  });
});

describe('bookmarks from the message actions', () => {
  it('bookmarks a message', async () => {
    const user = userEvent.setup();
    renderChat();
    const log = await screen.findByRole('log');
    await within(log).findByText('hello there');
    await user.click(within(log).getAllByRole('button', { name: 'Message actions' })[0] ?? log);
    await user.click(screen.getByRole('button', { name: 'Bookmark' }));
    expect(db.addBookmark).toHaveBeenCalledWith(CHAT_ID, 1, null);
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(db.listBookmarks).toHaveBeenCalledTimes(2);
  });

  it('labels a bookmarked message and edits or removes its bookmark', async () => {
    db.listBookmarks.mockResolvedValue([bookmarkView({ note: 'keep', message: { seq: 0 } })]);
    db.updateBookmark.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderChat();
    const log = await screen.findByRole('log');
    const article = await within(log).findByRole('article', { name: /hello there, Bookmarked$/u });
    await user.click(within(article).getByRole('button', { name: 'Message actions' }));
    await user.click(screen.getByRole('button', { name: 'Edit bookmark note' }));
    const field = screen.getByRole('textbox', { name: 'Note (optional)' });
    expect(field).toHaveValue('keep');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(db.updateBookmark).toHaveBeenCalledWith('bm-0', 'keep');
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    await user.click(within(article).getByRole('button', { name: 'Message actions' }));
    await user.click(screen.getByRole('button', { name: 'Remove bookmark' }));
    expect(db.removeBookmark).toHaveBeenCalledWith('bm-0');
  });
});
