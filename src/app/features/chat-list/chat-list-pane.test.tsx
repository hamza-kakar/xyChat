import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Route, Routes } from 'react-router';
import { renderWithProviders } from '../../test/providers';
import { chat, chatSummary, CHAT_ID } from '../../test/fixtures';
import { asChatId } from '../../../core/ids';
import { ChatListPane } from './chat-list-pane';

const db = vi.hoisted(() => ({
  listChats: vi.fn(),
  getChat: vi.fn(),
  renameChat: vi.fn(),
  deleteChat: vi.fn(),
}));

vi.mock('../../../client/db-client', () => ({ dbClient: db }));

const OTHER_ID = asChatId('1a2b3c4d-0000-4000-8000-000000000002');

beforeEach(() => {
  vi.clearAllMocks();
  db.listChats.mockResolvedValue([
    chatSummary(),
    chatSummary({ id: OTHER_ID, title: 'Work', isGroup: false, lastMessagePreview: 'ok' }),
  ]);
  db.getChat.mockResolvedValue(chat());
  db.renameChat.mockResolvedValue(undefined);
  db.deleteChat.mockResolvedValue([]);
});

function renderList(route = '/') {
  return renderWithProviders(
    <Routes>
      <Route path="/" element={<ChatListPane asSidebar={false} />} />
      <Route path="/chat/:chatId" element={<ChatListPane asSidebar />} />
    </Routes>,
    { route },
  );
}

describe('ChatListPane (§12.4)', () => {
  it('lists chats in the order served, with previews and links', async () => {
    renderList();
    const links = await screen.findAllByRole('link', { name: /Family|Work/u });
    expect(links.map((link) => link.textContent)).toEqual([
      expect.stringContaining('Family'),
      expect.stringContaining('Work'),
    ]);
    expect(links[0]).toHaveAttribute('href', `/chat/${CHAT_ID}`);
    expect(screen.getByText('Sara: see you soon')).toBeInTheDocument();
    expect(screen.getByText('Group')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'waChatBack' })).toHaveFocus();
  });

  it('filters titles locally as you type', async () => {
    const user = userEvent.setup();
    renderList();
    await screen.findByText('Work');
    await user.type(screen.getByLabelText('Filter chats by name'), 'wor');
    expect(screen.queryByText('Family')).toBeNull();
    expect(screen.getByText('Work')).toBeInTheDocument();
    await user.clear(screen.getByLabelText('Filter chats by name'));
    await user.type(screen.getByLabelText('Filter chats by name'), 'zzz');
    expect(screen.getByText('No chats match “zzz”.')).toBeInTheDocument();
  });

  it('shows the empty state with an import link', async () => {
    db.listChats.mockResolvedValue([]);
    renderList();
    expect(await screen.findByText('No chats yet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Import a chat' })).toHaveAttribute('href', '/import');
  });

  it('reports a failed load', async () => {
    db.listChats.mockRejectedValue(new Error('boom'));
    renderList();
    expect(await screen.findByRole('alert')).toHaveTextContent('Your chats could not be loaded.');
  });

  it('becomes navigation beside an open chat and marks it current', async () => {
    renderList(`/chat/${CHAT_ID}`);
    expect(await screen.findByRole('navigation', { name: 'Chats' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'waChatBack' })).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: /Family/u })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('renames a chat from its actions', async () => {
    const user = userEvent.setup();
    renderList();
    await user.click(await screen.findByRole('button', { name: 'More actions for Family' }));
    await user.click(screen.getByRole('button', { name: 'Rename' }));
    const input = screen.getByLabelText('Chat name');
    await user.clear(input);
    await user.type(input, '  Family 2026 ');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(db.renameChat).toHaveBeenCalledWith(CHAT_ID, 'Family 2026');
    expect(db.listChats).toHaveBeenCalledTimes(2);
  });

  it('does not save an empty name', async () => {
    const user = userEvent.setup();
    renderList();
    await user.click(await screen.findByRole('button', { name: 'More actions for Family' }));
    await user.click(screen.getByRole('button', { name: 'Rename' }));
    await user.clear(screen.getByLabelText('Chat name'));
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('confirms a delete with counts and bytes, then deletes', async () => {
    const user = userEvent.setup();
    renderList();
    await user.click(await screen.findByRole('button', { name: 'More actions for Family' }));
    await user.click(screen.getByRole('button', { name: 'Delete chat' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete “Family”?' });
    expect(
      await within(dialog).findByText(/3 messages and 1 media files \(2 KB\)/u),
    ).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
    expect(db.deleteChat).toHaveBeenCalledWith(CHAT_ID);
  });

  it('shows an error when an action fails and keeps the sheet open', async () => {
    db.deleteChat.mockRejectedValue(new Error('locked'));
    const user = userEvent.setup();
    renderList();
    await user.click(await screen.findByRole('button', { name: 'More actions for Family' }));
    await user.click(screen.getByRole('button', { name: 'Delete chat' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete “Family”?' });
    await within(dialog).findByText(/3 messages/u);
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('That didn’t work.');
  });

  it('opens the actions with a right-click and closes them', async () => {
    const user = userEvent.setup();
    renderList();
    await user.pointer({
      keys: '[MouseRight]',
      target: await screen.findByRole('link', { name: /Family/u }),
    });
    const dialog = screen.getByRole('dialog', { name: 'Family' });
    await user.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
