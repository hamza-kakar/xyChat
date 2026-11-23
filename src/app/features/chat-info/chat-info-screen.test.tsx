import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Route, Routes, useLocation } from 'react-router';
import { asImportId } from '../../../core/ids';
import { renderWithProviders } from '../../test/providers';
import { ALI, CHAT_ID, SARA, chat, participant } from '../../test/fixtures';
import { ChatInfoScreen } from './chat-info-screen';

const db = vi.hoisted(() => ({
  getChat: vi.fn(),
  getChatStats: vi.fn(),
  getParticipants: vi.fn(),
  listImports: vi.fn(),
  renameChat: vi.fn(),
  setSelf: vi.fn(),
  deleteChat: vi.fn(),
}));

vi.mock('../../../client/db-client', () => ({ dbClient: db }));

function Probe() {
  const location = useLocation();
  return <p>{`at ${location.pathname}`}</p>;
}

function renderInfo(route = `/chat/${CHAT_ID}/info`) {
  return renderWithProviders(
    <Routes>
      <Route path="/chat/:chatId/info" element={<ChatInfoScreen />} />
      <Route path="*" element={<Probe />} />
    </Routes>,
    { route },
  );
}

const report = {
  warningsByCode: { INVALID_DATE: 2, OUT_OF_ORDER_TIMESTAMP: 1 },
  mediaStored: 1,
  mediaMissing: 0,
  mediaOmitted: 0,
  durationMs: 10,
  messagesAdded: 120,
  duplicatesSkipped: 7,
  mediaUpgraded: 0,
};

beforeEach(() => {
  vi.clearAllMocks();
  db.getChat.mockResolvedValue(chat({ messageCount: 130, mediaCount: 1, mediaBytes: 2048 }));
  db.getChatStats.mockResolvedValue({
    totalsByKind: { text: 120, media: 1, system: 9 },
    mediaCounts: { image: 1 },
    mediaBytes: 2048,
    dateRange: {
      first: { year: 2026, month: 1, day: 3, hour: 9, minute: 0, second: 0 },
      last: { year: 2026, month: 11, day: 17, hour: 23, minute: 59, second: 0 },
    },
  });
  db.getParticipants.mockResolvedValue([
    participant({ id: SARA, displayName: 'Sara', messageCount: 40 }),
    participant({ id: ALI, displayName: 'Ali', messageCount: 80 }),
  ]);
  db.listImports.mockResolvedValue([
    {
      id: asImportId('imp-1'),
      chatId: CHAT_ID,
      fileName: 'WhatsApp Chat - Family.zip',
      fileBytes: 1000,
      status: 'complete',
      parserVersion: '1.2.0',
      startedAt: '2026-11-18T10:00:00Z',
      finishedAt: '2026-11-18T10:01:00Z',
      writtenPaths: [],
      report,
    },
    {
      id: asImportId('imp-0'),
      chatId: CHAT_ID,
      fileName: 'old.txt',
      fileBytes: 10,
      status: 'complete',
      parserVersion: '1.1.0',
      startedAt: '2026-11-01T10:00:00Z',
      finishedAt: '2026-11-01T10:01:00Z',
      writtenPaths: [],
      report: null,
    },
  ]);
  db.renameChat.mockResolvedValue(undefined);
  db.setSelf.mockResolvedValue(undefined);
  db.deleteChat.mockResolvedValue([]);
});

describe('ChatInfoScreen (§12.7)', () => {
  it('shows the overview, totals, media and participants', async () => {
    renderInfo();
    expect(await screen.findByRole('heading', { level: 1, name: 'Chat info' })).toHaveFocus();
    expect(await screen.findByText('Group chat')).toBeInTheDocument();
    expect(screen.getByText(/Jan 3, 2026 – Nov 17, 2026/u)).toBeInTheDocument();
    expect(screen.getByText('130 messages')).toBeInTheDocument();
    const totals = screen.getByRole('region', { name: 'Messages by type' });
    expect(within(totals).getByText('System message')).toBeInTheDocument();
    expect(within(totals).queryByText('Poll')).not.toBeInTheDocument();
    expect(screen.getByText('1 file stored · 2 KB')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open media gallery' })).toHaveAttribute(
      'href',
      `/chat/${CHAT_ID}/media`,
    );
    const people = within(screen.getByRole('region', { name: 'Participants' })).getAllByRole(
      'listitem',
    );
    expect(people.map((item) => item.getAttribute('aria-label'))).toEqual([
      'Ali: 80 messages',
      'Sara: 40 messages',
    ]);
  });

  it('lists the import history with counts and warnings', async () => {
    renderInfo();
    const history = await screen.findByRole('region', { name: 'Import history' });
    expect(within(history).getByText(/WhatsApp Chat - Family\.zip/u)).toBeInTheDocument();
    expect(within(history).getByText('120 added · 7 already there')).toBeInTheDocument();
    expect(within(history).getByText(/Parser 1\.2\.0 · 3 warnings/u)).toBeInTheDocument();
    expect(within(history).getByText('Complete · No details recorded')).toBeInTheDocument();
  });

  it('renames the chat', async () => {
    const user = userEvent.setup();
    renderInfo();
    const field = await screen.findByLabelText('Chat name');
    const save = screen.getByRole('button', { name: 'Save name' });
    expect(save).toBeDisabled();
    await user.clear(field);
    await user.type(field, 'Family 2026');
    await user.click(save);
    expect(db.renameChat).toHaveBeenCalledWith(CHAT_ID, 'Family 2026');
    expect(await screen.findByText('Name saved.')).toBeInTheDocument();
  });

  it('chooses which participant is me', async () => {
    const user = userEvent.setup();
    renderInfo();
    const group = await screen.findByRole('group', { name: 'Which one is you?' });
    expect(within(group).getByRole('radio', { name: 'Not set' })).toBeChecked();
    await user.click(within(group).getByRole('radio', { name: 'Ali' }));
    expect(db.setSelf).toHaveBeenCalledWith(CHAT_ID, ALI);
  });

  it('deletes the chat after confirmation and leaves', async () => {
    const user = userEvent.setup();
    renderInfo();
    await user.click(await screen.findByRole('button', { name: 'Delete chat' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/130 messages and 1 media files \(2 KB\)/u)).toBeVisible();
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
    expect(db.deleteChat).toHaveBeenCalledWith(CHAT_ID);
    expect(await screen.findByText('at /')).toBeInTheDocument();
  });

  it('links to the import flow to update from a newer export', async () => {
    renderInfo();
    expect(await screen.findByRole('link', { name: 'Update from a newer export' })).toHaveAttribute(
      'href',
      '/import',
    );
  });

  it('shows not found for an invalid id or a missing chat', async () => {
    renderInfo('/chat/not a chat!/info');
    expect(await screen.findByRole('alert')).toHaveTextContent('doesn’t exist');
  });

  it('shows not found for a deleted chat', async () => {
    db.getChat.mockResolvedValue(null);
    renderInfo();
    expect(await screen.findByRole('alert')).toHaveTextContent('doesn’t exist');
  });
});
