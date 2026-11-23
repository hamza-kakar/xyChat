import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Route, Routes } from 'react-router';
import { renderWithProviders } from '../../test/providers';
import { stubDivLayout } from '../../test/layout-stub';
import { ALI, chat, CHAT_ID, message, participant, SARA } from '../../test/fixtures';
import { asImportId } from '../../../core/ids';
import { ChatViewScreen } from './chat-view-screen';

const db = vi.hoisted(() => ({
  getChat: vi.fn(),
  getParticipants: vi.fn(),
  getMessageWindow: vi.fn(),
  getLastChatPosition: vi.fn(),
  setLastChatPosition: vi.fn(),
  setSelf: vi.fn(),
  listImports: vi.fn(),
  readContactName: vi.fn(),
  listBookmarks: vi.fn(),
}));

vi.mock('../../../client/db-client', () => ({ dbClient: db }));

const messages = [
  message({ seq: 0, body: 'hello there' }),
  message({
    seq: 1,
    authorId: ALI,
    authorName: 'Ali Khan',
    body: 'hi Sara',
    tsLocal: { year: 2026, month: 11, day: 17, hour: 21, minute: 20, second: 0 },
    tsKey: Date.UTC(2026, 10, 17, 21, 20, 0) / 1000,
  }),
  message({ seq: 2, kind: 'system', authorId: null, authorName: null, body: 'Ali Khan left' }),
];

let restoreLayout: () => void = () => undefined;

beforeEach(() => {
  restoreLayout = stubDivLayout();
  vi.clearAllMocks();
  db.getChat.mockResolvedValue(chat());
  db.getParticipants.mockResolvedValue([
    participant(),
    participant({ id: ALI, displayName: 'Ali Khan', colorIndex: 7 }),
  ]);
  db.getMessageWindow.mockResolvedValue({ messages, hasBefore: false, hasAfter: false });
  db.getLastChatPosition.mockResolvedValue(null);
  db.setLastChatPosition.mockResolvedValue(undefined);
  db.setSelf.mockResolvedValue(undefined);
  db.listBookmarks.mockResolvedValue([]);
  db.listImports.mockResolvedValue([
    {
      id: asImportId('imp-1'),
      chatId: CHAT_ID,
      fileName: 'WhatsApp Chat - Family.zip',
      fileBytes: 10,
      status: 'complete',
      parserVersion: '1.0.0',
      startedAt: '2026-11-18T10:00:00Z',
      finishedAt: '2026-11-18T10:00:05Z',
      writtenPaths: [],
    },
  ]);
});

afterEach(() => {
  vi.unstubAllGlobals();
  restoreLayout();
});

function renderChat(id: string = CHAT_ID) {
  return renderWithProviders(
    <Routes>
      <Route path="/chat/:chatId" element={<ChatViewScreen />} />
      <Route path="/" element={<p>chat list</p>} />
    </Routes>,
    { route: `/chat/${id}` },
  );
}

describe('ChatViewScreen', () => {
  it('renders the header, the log and its messages', async () => {
    renderChat();

    expect(await screen.findByRole('heading', { level: 1, name: 'Family' })).toHaveFocus();
    expect(await screen.findByText('2 participants')).toBeInTheDocument();
    const log = screen.getByRole('log', { name: 'Messages in Family' });
    expect(log).toHaveAttribute('aria-live', 'off');
    expect(await within(log).findByText('hello there')).toBeInTheDocument();
    expect(within(log).getByText('Ali Khan left')).toBeInTheDocument();
    const article = within(log).getByRole('article', { name: /^Ali Khan, .*: hi Sara$/u });
    expect(article).toHaveAttribute('aria-posinset', '2');
    expect(article).toHaveAttribute('aria-setsize', '3');
    expect(db.getMessageWindow).toHaveBeenCalledWith({
      chatId: CHAT_ID,
      anchorSeq: 0,
      before: 0,
      after: 299,
    });
  });

  it('colors group sender names from the participant palette', async () => {
    renderChat();
    const name = await screen.findByText('Ali Khan', { selector: 'span' });
    expect(name.getAttribute('style')).toContain('var(--name-7)');
  });

  it('shows "Not found" for an unknown chat with a way back', async () => {
    db.getChat.mockResolvedValue(null);
    const user = userEvent.setup();
    renderChat();
    expect(
      await screen.findByRole('heading', { name: 'This chat doesn’t exist.' }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Back to chats' }));
    expect(screen.getByText('chat list')).toBeInTheDocument();
  });

  it('reports a chat that fails to load', async () => {
    db.getChat.mockRejectedValue(new Error('boom'));
    renderChat();
    expect(
      await screen.findByRole('heading', { name: 'This chat could not be loaded.' }),
    ).toBeInTheDocument();
  });

  it('offers the self choice and saves it', async () => {
    const user = userEvent.setup();
    renderChat();
    await user.click(await screen.findByRole('button', { name: 'Choose' }));
    const dialog = screen.getByRole('dialog', { name: 'Which one is you?' });
    await user.click(await within(dialog).findByRole('button', { name: 'Sara' }));
    expect(db.setSelf).toHaveBeenCalledWith(CHAT_ID, SARA);
  });

  it('hides the self banner once dismissed, for the session', async () => {
    const user = userEvent.setup();
    const first = renderChat();
    await user.click(await screen.findByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText(/Choose which person is you/u)).toBeNull();
    first.unmount();
    renderChat();
    await screen.findByRole('heading', { level: 1, name: 'Family' });
    expect(screen.queryByText(/Choose which person is you/u)).toBeNull();
  });

  it('opens message actions: copy and info with the import', async () => {
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderChat();
    const log = await screen.findByRole('log');
    await within(log).findByText('hello there');
    await user.click(within(log).getAllByRole('button', { name: 'Message actions' })[0] ?? log);
    const sheet = screen.getByRole('dialog', { name: 'Message' });
    await user.click(within(sheet).getByRole('button', { name: 'Copy text' }));
    expect(writeText).toHaveBeenCalledWith('hello there');
    expect(await within(sheet).findByRole('button', { name: 'Copied' })).toBeInTheDocument();
    await user.click(within(sheet).getByRole('button', { name: 'Message info' }));
    const info = screen.getByRole('dialog', { name: 'Message info' });
    expect(within(info).getByText('Sara')).toBeInTheDocument();
    expect(within(info).getByText('Text')).toBeInTheDocument();
    expect(await within(info).findByText(/^WhatsApp Chat - Family\.zip, /u)).toBeInTheDocument();
  });

  it('keeps text selection and the callout off the long-press area on touch', async () => {
    renderChat();
    const log = await screen.findByRole('log');
    const text = await within(log).findByText('hello there');
    const pressable = text.closest('article')?.firstElementChild;
    expect(pressable).toHaveClass('pointer-coarse:select-none', '[-webkit-touch-callout:none]');
  });

  it('remembers the position when leaving', async () => {
    const view = renderChat();
    await screen.findByText('hello there');
    view.unmount();
    await waitFor(() => {
      expect(db.setLastChatPosition).toHaveBeenCalled();
    });
    expect(db.setLastChatPosition.mock.calls[0]?.[0]).toBe(CHAT_ID);
  });
});
