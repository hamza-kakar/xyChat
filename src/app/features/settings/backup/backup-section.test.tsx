import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../test/providers';
import { CHAT_ID, chatSummary } from '../../../test/fixtures';
import type { TransferCallbacks } from '../../../queries/backup-queries';
import { BackupSection } from './backup-section';

const db = vi.hoisted(() => ({
  listChats: vi.fn(),
  estimateBackup: vi.fn(),
  createBackup: vi.fn(),
  inspectBackup: vi.fn(),
  restoreBackup: vi.fn(),
  getChat: vi.fn(),
}));
const share = vi.hoisted(() => ({
  canShareFile: vi.fn(),
  shareFile: vi.fn(),
  downloadFile: vi.fn(),
}));
const files = vi.hoisted(() => ({ readStoredFile: vi.fn() }));

vi.mock('../../../../client/db-client', () => ({ dbClient: db }));
vi.mock('../../../../platform/share-file', () => share);
vi.mock('../../../../platform/media-url', () => files);

const archive = new File(['zip'], 'wachatback-backup-20261123-0905.zip');

/** A promise with its resolve handle, to hold a run open. */
function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const preview = {
  ok: true,
  value: {
    createdAt: '2026-11-23T09:05:00.000Z',
    appVersion: '0.1.0',
    includesMedia: false,
    chats: [
      {
        backupChatId: 'b-1',
        title: 'Family',
        isGroup: true,
        messageCount: 3,
        mediaCount: 1,
        firstTsKey: 1,
        lastTsKey: 2,
        match: { chatId: CHAT_ID, title: 'Family' },
      },
      {
        backupChatId: 'b-2',
        title: 'Work',
        isGroup: false,
        messageCount: 1,
        mediaCount: 0,
        firstTsKey: 1,
        lastTsKey: 1,
        match: null,
      },
    ],
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  db.listChats.mockResolvedValue([chatSummary()]);
  db.estimateBackup.mockResolvedValue(2_097_152);
  db.getChat.mockResolvedValue(null);
  share.canShareFile.mockReturnValue(true);
  share.shareFile.mockResolvedValue('shared');
  files.readStoredFile.mockResolvedValue(archive);
});

describe('make a backup', () => {
  it('estimates, shows progress, and offers the finished file', async () => {
    const user = userEvent.setup();
    const run = deferred<unknown>();
    let callbacks: TransferCallbacks | null = null;
    db.createBackup.mockImplementation((_request: unknown, hooks: TransferCallbacks) => {
      callbacks = hooks;
      return run.promise;
    });
    renderWithProviders(<BackupSection />);
    expect(await screen.findByText('About 2 MB')).toBeInTheDocument();
    db.estimateBackup.mockResolvedValue(2 * 1024 ** 3);
    await user.selectOptions(screen.getByLabelText('Chats'), 'Family');
    await user.click(screen.getByLabelText('Include photos, videos and other media'));
    expect(await screen.findByText(/Backups over 1 GB may fail/u)).toBeInTheDocument();
    expect(db.estimateBackup).toHaveBeenLastCalledWith({ chatIds: [CHAT_ID], includeMedia: false });

    await user.click(screen.getByRole('button', { name: 'Make backup' }));
    expect(db.createBackup.mock.calls[0]?.[0]).toMatchObject({
      chatIds: [CHAT_ID],
      includeMedia: false,
      appName: 'waChatBack',
    });
    (callbacks as TransferCallbacks | null)?.onProgress({ phase: 'media', current: 2, total: 5 });
    expect(await screen.findByText('Adding media (2 of 5)…')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect((callbacks as TransferCallbacks | null)?.isCancelled()).toBe(true);
    expect(screen.getByText('Cancelling…')).toBeInTheDocument();

    run.resolve({
      ok: true,
      value: {
        path: `backup-tmp/${archive.name}`,
        fileName: archive.name,
        bytes: 2048,
        chatCount: 1,
        mediaFiles: 0,
        mediaMissing: 2,
      },
    });
    expect(await screen.findByText(/Backup ready: wachatback-backup/u)).toBeInTheDocument();
    expect(screen.getByText(/2 media files were already gone/u)).toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: 'Share backup' }));
    expect(share.shareFile).toHaveBeenCalledWith(archive);
    await user.click(screen.getByRole('button', { name: 'Save backup' }));
    expect(share.downloadFile).toHaveBeenCalledWith(archive);
  });

  it('explains failures and the empty state', async () => {
    const user = userEvent.setup();
    db.createBackup.mockResolvedValue({ ok: false, error: { code: 'QUOTA' } });
    renderWithProviders(<BackupSection />);
    await user.click(await screen.findByRole('button', { name: 'Make backup' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Not enough free storage/u);
    db.createBackup.mockRejectedValue(new Error('INTERNAL: x'));
    await user.click(screen.getByRole('button', { name: 'Make backup' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong. Try again.');
  });

  it('asks for an import when there is nothing to back up', async () => {
    db.listChats.mockResolvedValue([]);
    renderWithProviders(<BackupSection />);
    expect(await screen.findByText(/Import a chat first/u)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Re-import an original export' })).toHaveAttribute(
      'href',
      '/import',
    );
  });
});

describe('restore from a backup', () => {
  it('previews, takes choices and reports', async () => {
    const user = userEvent.setup();
    db.inspectBackup.mockResolvedValue(preview);
    db.restoreBackup.mockResolvedValue({
      ok: true,
      value: [
        {
          chatId: CHAT_ID,
          title: 'Family',
          action: 'replace',
          messagesAdded: 3,
          duplicatesSkipped: 0,
          mediaRestored: 0,
          mediaMissing: 1,
          bookmarksRestored: 0,
        },
      ],
    });
    const file = new File(['zip'], 'backup.zip');
    renderWithProviders(<BackupSection />);
    await user.upload(screen.getByLabelText('Choose a backup file'), file);
    const family = await screen.findByRole('group', { name: 'Family' });
    expect(within(family).getByLabelText('Merge into “Family”')).toBeChecked();
    const work = screen.getByRole('group', { name: 'Work' });
    expect(within(work).getByLabelText('Restore')).toBeChecked();
    expect(screen.getByText(/Without media/u)).toBeInTheDocument();

    await user.click(within(family).getByLabelText('Replace “Family”'));
    expect(screen.getByText(/Replace deletes the chat/u)).toBeInTheDocument();
    await user.click(within(work).getByLabelText('Skip'));
    await user.click(screen.getByRole('button', { name: 'Restore' }));
    await waitFor(() => {
      expect(db.restoreBackup).toHaveBeenCalled();
    });
    expect(db.restoreBackup.mock.calls[0]?.[0]).toEqual({
      file,
      fileName: 'backup.zip',
      decisions: [
        { backupChatId: 'b-1', choice: 'replace', targetChatId: CHAT_ID },
        { backupChatId: 'b-2', choice: 'skip', targetChatId: null },
      ],
    });
    expect(await screen.findByText('Restored 1 chat.')).toBeInTheDocument();
    expect(screen.getByText('Family: 3 added, 0 already there')).toBeInTheDocument();
    expect(screen.getByText(/1 media file not found/u)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open chat' })).toHaveAttribute(
      'href',
      `/chat/${CHAT_ID}`,
    );
  });

  it('disables restore when everything is skipped and shows errors', async () => {
    const user = userEvent.setup();
    db.inspectBackup.mockResolvedValue(preview);
    db.restoreBackup.mockResolvedValue({ ok: false, error: { code: 'CANCELLED' } });
    renderWithProviders(<BackupSection />);
    await user.upload(screen.getByLabelText('Choose a backup file'), new File(['z'], 'b.zip'));
    const family = await screen.findByRole('group', { name: 'Family' });
    await user.click(within(family).getByLabelText('Skip'));
    await user.click(within(screen.getByRole('group', { name: 'Work' })).getByLabelText('Skip'));
    expect(screen.getByRole('button', { name: 'Restore' })).toBeDisabled();
    await user.click(within(family).getByLabelText('Merge into “Family”'));
    await user.click(screen.getByRole('button', { name: 'Restore' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Cancelled. Nothing was restored.');
  });

  it('names the problem with a file that is not a backup', async () => {
    const user = userEvent.setup();
    db.inspectBackup.mockResolvedValue({ ok: false, error: { code: 'NOT_A_BACKUP' } });
    renderWithProviders(<BackupSection />);
    await user.upload(screen.getByLabelText('Choose a backup file'), new File(['z'], 'b.zip'));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This file is not a waChatBack backup.',
    );
    expect(screen.getByLabelText('Choose another file')).toBeInTheDocument();
  });
});
