import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/providers';
import { CHAT_ID, chatSummary } from '../../test/fixtures';
import { applyThemePreference } from '../../hooks/use-theme-preference';
import { logger } from '../../logging/logger';
import { LockContext } from '../lock/lock-context';
import { SettingsScreen } from './settings-screen';

const db = vi.hoisted(() => ({
  getLockState: vi.fn(),
  changePin: vi.fn(),
  setAutoLock: vi.fn(),
  storageUsage: vi.fn(),
  listChats: vi.fn(),
  listOrphanMedia: vi.fn(),
  deleteOrphanMedia: vi.fn(),
  getSchemaVersion: vi.fn(),
  savePersistedLogs: vi.fn(),
  listPersistedLogs: vi.fn(),
  estimateBackup: vi.fn(),
}));
const platform = vi.hoisted(() => ({
  estimateStorage: vi.fn(),
  isStoragePersisted: vi.fn(),
  requestPersistentStorage: vi.fn(),
  checkCapabilities: vi.fn(),
}));

vi.mock('../../../client/db-client', () => ({ dbClient: db }));
vi.mock('../../../platform/persistence', () => ({
  estimateStorage: platform.estimateStorage,
  isStoragePersisted: platform.isStoragePersisted,
  requestPersistentStorage: platform.requestPersistentStorage,
}));
vi.mock('../../../platform/capabilities', () => ({
  CAPABILITY_ORDER: ['moduleWorkers', 'opfs'],
  checkCapabilities: platform.checkCapabilities,
}));

const lockNow = vi.fn();

function renderSettings() {
  return renderWithProviders(
    <LockContext value={{ lockNow }}>
      <SettingsScreen />
    </LockContext>,
    { route: '/settings' },
  );
}

const licenses = [
  { name: 'react', version: '19.3.1', license: 'MIT', text: 'MIT License text' },
  { name: 'sqlite', version: '3', license: 'Apache-2.0', text: null },
];

beforeEach(() => {
  vi.clearAllMocks();
  db.getLockState.mockResolvedValue({ hasPin: false, autoLockMinutes: 0, lockedUntil: null });
  db.changePin.mockResolvedValue({ ok: true, lockedUntil: null });
  db.setAutoLock.mockResolvedValue(undefined);
  db.storageUsage.mockResolvedValue({
    totalBytes: 3_145_728,
    perChat: [{ chatId: CHAT_ID, bytes: 3_145_728 }],
  });
  db.listChats.mockResolvedValue([
    chatSummary(),
    chatSummary({ id: chatSummary().id.replace('0f', '1f') as typeof CHAT_ID, title: 'Empty' }),
  ]);
  db.listOrphanMedia.mockResolvedValue([]);
  db.deleteOrphanMedia.mockResolvedValue(2);
  db.getSchemaVersion.mockResolvedValue(2);
  db.estimateBackup.mockResolvedValue(1_000);
  db.savePersistedLogs.mockResolvedValue(undefined);
  platform.estimateStorage.mockResolvedValue({ usage: 5_242_880, quota: 1_073_741_824 });
  platform.isStoragePersisted.mockResolvedValue(false);
  platform.requestPersistentStorage.mockResolvedValue(false);
  platform.checkCapabilities.mockResolvedValue({
    ok: false,
    failures: [{ id: 'opfs', reason: 'x' }],
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response(JSON.stringify(licenses)))),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  applyThemePreference('system');
});

describe('SettingsScreen', () => {
  it('switches the theme', async () => {
    const user = userEvent.setup();
    renderSettings();
    expect(await screen.findByRole('heading', { level: 1, name: 'Settings' })).toHaveFocus();
    await user.click(screen.getByRole('radio', { name: 'Dark' }));
    expect(document.documentElement.dataset['theme']).toBe('dark');
    expect(screen.getByRole('radio', { name: 'Dark' })).toBeChecked();
  });

  it('turns the app lock on after validating the PIN twice', async () => {
    const user = userEvent.setup();
    renderSettings();
    const lock = await screen.findByRole('region', { name: 'App lock' });
    expect(within(lock).getByText(/privacy screen, not encryption/u)).toBeInTheDocument();
    await user.type(await within(lock).findByLabelText('New PIN (4–8 digits)'), '12');
    await user.click(within(lock).getByRole('button', { name: 'Turn on app lock' }));
    expect(within(lock).getByRole('alert')).toHaveTextContent('Use 4 to 8 digits.');

    await user.type(within(lock).getByLabelText('New PIN (4–8 digits)'), '34');
    await user.type(within(lock).getByLabelText('Repeat the new PIN'), '1235');
    await user.click(within(lock).getByRole('button', { name: 'Turn on app lock' }));
    expect(within(lock).getByRole('alert')).toHaveTextContent('don’t match');
    expect(db.changePin).not.toHaveBeenCalled();

    await user.clear(within(lock).getByLabelText('Repeat the new PIN'));
    await user.type(within(lock).getByLabelText('Repeat the new PIN'), '1234');
    await user.click(within(lock).getByRole('button', { name: 'Turn on app lock' }));
    expect(db.changePin).toHaveBeenCalledWith({ current: null, next: '1234' });
    expect(await within(lock).findByRole('status')).toHaveTextContent('Saved.');
  });

  it('manages a set PIN: auto-lock, lock now, change and remove', async () => {
    const user = userEvent.setup();
    db.getLockState.mockResolvedValue({ hasPin: true, autoLockMinutes: 5, lockedUntil: null });
    renderSettings();
    const lock = await screen.findByRole('region', { name: 'App lock' });
    expect(await within(lock).findByRole('radio', { name: 'After 5 min' })).toBeChecked();
    await user.click(within(lock).getByRole('radio', { name: 'Immediately' }));
    expect(db.setAutoLock).toHaveBeenCalledWith(0);

    await user.click(within(lock).getByRole('button', { name: 'Lock now' }));
    expect(lockNow).toHaveBeenCalled();

    await user.click(within(lock).getByRole('button', { name: 'Turn off app lock' }));
    db.changePin.mockResolvedValueOnce({ ok: false, lockedUntil: null });
    await user.type(within(lock).getByLabelText('Current PIN'), '9999');
    await user.click(within(lock).getByRole('button', { name: 'Turn off app lock' }));
    expect(db.changePin).toHaveBeenCalledWith({ current: '9999', next: null });
    expect(await within(lock).findByRole('alert')).toHaveTextContent('current PIN is wrong');

    db.changePin.mockResolvedValueOnce({ ok: false, lockedUntil: Date.now() + 30_000 });
    await user.type(within(lock).getByLabelText('Current PIN'), '8888');
    await user.click(within(lock).getByRole('button', { name: 'Turn off app lock' }));
    expect(await within(lock).findByText(/Try again in (30|29) s/u)).toBeInTheDocument();

    await user.click(within(lock).getByRole('button', { name: 'Cancel' }));
    await user.click(within(lock).getByRole('button', { name: 'Change PIN' }));
    await user.type(within(lock).getByLabelText('Current PIN'), '1234');
    await user.type(within(lock).getByLabelText('New PIN (4–8 digits)'), '5678');
    await user.type(within(lock).getByLabelText('Repeat the new PIN'), '5678');
    await user.click(within(lock).getByRole('button', { name: 'Change PIN' }));
    expect(db.changePin).toHaveBeenLastCalledWith({ current: '1234', next: '5678' });
  });

  it('shows storage use, media per chat and persistence', async () => {
    const user = userEvent.setup();
    renderSettings();
    const storage = await screen.findByRole('region', { name: 'Storage' });
    expect(await within(storage).findByText(/5 MB used of 1 GB/u)).toBeInTheDocument();
    const rows = await within(storage).findAllByRole('listitem');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent('Family3 MB');
    await user.click(within(storage).getByRole('button', { name: 'Request persistent storage' }));
    expect(await within(storage).findByText(/browser declined/u)).toBeInTheDocument();
  });

  it('cleans up orphaned files after confirmation', async () => {
    const user = userEvent.setup();
    renderSettings();
    const storage = await screen.findByRole('region', { name: 'Storage' });
    const cleanUp = within(storage).getByRole('button', { name: 'Clean up orphaned files' });
    await user.click(cleanUp);
    expect(await within(storage).findByText('No orphaned files.')).toBeInTheDocument();

    db.listOrphanMedia.mockResolvedValue(['media/a/1.jpg', 'thumbs/a/1.jpg']);
    await user.click(cleanUp);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/2 stored files belong to no message/u)).toBeVisible();
    await user.click(within(dialog).getByRole('button', { name: 'Delete files' }));
    expect(db.deleteOrphanMedia).toHaveBeenCalledWith(['media/a/1.jpg', 'thumbs/a/1.jpg']);
    expect(await within(storage).findByText('2 files deleted.')).toBeInTheDocument();
  });

  it('shows versions, capabilities and the log, and clears it', async () => {
    const user = userEvent.setup();
    logger.warn('test.settings', { count: 1 });
    renderSettings();
    const diagnostics = await screen.findByRole('region', { name: 'Diagnostics' });
    expect(await within(diagnostics).findByText('2')).toBeInTheDocument();
    expect(await within(diagnostics).findByText('Missing')).toBeInTheDocument();
    expect(within(diagnostics).getByText(/warn test\.settings \{"count":1\}/u)).toBeInTheDocument();

    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    await user.click(within(diagnostics).getByRole('button', { name: 'Copy diagnostics' }));
    expect(await within(diagnostics).findByText('Copied.')).toBeInTheDocument();
    expect(writeText.mock.calls[0]).toEqual([expect.stringContaining('"schemaVersion": 2')]);

    await user.click(within(diagnostics).getByRole('button', { name: 'Clear log' }));
    expect(await within(diagnostics).findByText('The log is empty.')).toBeInTheDocument();
    expect(db.savePersistedLogs).toHaveBeenCalledWith([]);
  });

  it('shows the privacy statement and the licenses', async () => {
    renderSettings();
    const about = await screen.findByRole('region', { name: 'About' });
    expect(within(about).getByText(/never leave this device/u)).toBeInTheDocument();
    expect(within(about).getByRole('link', { name: 'Source code' })).toHaveAttribute(
      'rel',
      'noopener noreferrer',
    );
    expect(await within(about).findByText('react 19.3.1 · MIT')).toBeInTheDocument();
    expect(within(about).getByText('MIT License text')).toBeInTheDocument();
    expect(
      within(about).getByText(/ships no license file; its license is Apache-2\.0/u),
    ).toBeInTheDocument();
  });

  it('reports a license list that cannot load', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('', { status: 404 }))),
    );
    renderSettings();
    const about = await screen.findByRole('region', { name: 'About' });
    await waitFor(() => {
      expect(within(about).getByText('The license list could not be loaded.')).toBeInTheDocument();
    });
  });
});
