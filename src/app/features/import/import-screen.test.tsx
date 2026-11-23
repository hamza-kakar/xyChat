/**
 * Import screen container tests (§12.8): the pick → detect → confirm →
 * begin flow with both worker clients mocked (§18.4); the report and
 * error branches.
 */
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { installGateDone } from './install-gate-state';
import { ImportScreen } from './import-screen';
import { renderWithProviders } from '../../test/providers';
import { useIsLongTaskRunning } from '../../hooks/use-long-task';
import type { DetectReport } from '../../../workers/import-detect';

const detectMock = vi.hoisted(() => vi.fn());
const beginMock = vi.hoisted(() => vi.fn());
const getParticipantsMock = vi.hoisted(() => vi.fn());
const setSelfMock = vi.hoisted(() => vi.fn());
const persistedMock = vi.hoisted(() => vi.fn());
const persistMock = vi.hoisted(() => vi.fn());

vi.mock('../../../platform/persistence', () => ({
  isStoragePersisted: () => persistedMock() as Promise<boolean>,
  requestPersistentStorage: () => persistMock() as Promise<boolean>,
}));

vi.mock('../../../client/import-client', () => ({
  importClient: {
    detect: (...args: unknown[]) => {
      return detectMock(...args) as Promise<unknown>;
    },
    begin: (...args: unknown[]) => {
      return beginMock(...args) as Promise<unknown>;
    },
  },
  onImportProgress: () => () => undefined,
  cancelImport: () => undefined,
}));

vi.mock('../../../client/db-client', () => ({
  dbClient: {
    getParticipants: (...args: unknown[]) => {
      return getParticipantsMock(...args) as Promise<unknown>;
    },
    setSelf: (...args: unknown[]) => {
      return setSelfMock(...args) as Promise<unknown>;
    },
  },
}));

vi.mock('../../../workers/import-detect', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  // Nothing to override: the report type flows through mocked values.
}));

const report: DetectReport = {
  format: {
    platform: 'ios',
    headerPatternId: 'ios-bracket',
    dateOrder: 'DMY',
    dateOrderSource: 'locale-hint',
    clock: '12h',
    hasSeconds: true,
    confidence: 0.9,
    sampleMessages: [],
  },
  title: 'Family',
  isGroup: true,
  participants: ['Sara', 'Ali Khan'],
  archiveBytes: 1_000,
  freeBytes: 5_000_000,
  uncompressedTotalBytes: 2_000,
  replacementChars: 0,
  messagesCount: 5,
  mediaFilesFound: 1,
  mediaFilesMissing: 1,
};

function pickedFile(): File {
  return new File(['zip'], 'WhatsApp Chat - Family.zip');
}

/** A successful begin() answer for chat-9. */
function beginSuccess(counts: { readonly attachments: number; readonly stored: number }): unknown {
  return {
    commit: {
      chatId: 'chat-9',
      importId: 'imp-1',
      messagesInserted: 5,
      duplicatesSkipped: 0,
      attachmentsInserted: counts.attachments,
      mediaUpgraded: 0,
    },
    report: {
      warningsByCode: {},
      stats: { lines: 8, messages: 5, system: 0, media: counts.attachments },
      replacementChars: 0,
      durationMs: 900,
      mediaStored: counts.stored,
      mediaMissing: counts.attachments - counts.stored,
      mediaOmitted: 0,
    },
    chatId: 'chat-9',
  };
}

/** Renders the screen and picks the export file. */
async function renderAndPick(
  user: ReturnType<typeof userEvent.setup>,
): Promise<ReturnType<typeof renderWithProviders>> {
  const view = renderWithProviders(<ImportScreen />);
  await user.upload(screen.getByLabelText('Choose export file (.zip or .txt)'), pickedFile());
  return view;
}

function LongTaskProbe() {
  return <p>{useIsLongTaskRunning() ? 'task running' : 'no task'}</p>;
}

/** On the confirm screen: chooses Sara as "me" and starts the import. */
async function confirmAsSara(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await screen.findByText('Confirm import');
  const sara = screen.getAllByRole('button', { name: 'Sara' })[0];
  if (sara !== undefined) {
    await user.click(sara);
  }
  await user.click(screen.getByRole('button', { name: 'Start import' }));
}

describe('ImportScreen (§12.8)', () => {
  beforeEach(() => {
    detectMock.mockReset();
    beginMock.mockReset();
    getParticipantsMock.mockReset();
    setSelfMock.mockReset();
    setSelfMock.mockResolvedValue(undefined);
    persistedMock.mockReset();
    persistedMock.mockResolvedValue(false);
    persistMock.mockReset();
    persistMock.mockResolvedValue(true);
    installGateDone(true);
  });

  it('runs pick → detect → confirm and starts the import', async () => {
    const user = userEvent.setup();
    detectMock.mockResolvedValue({ report, suggestedTargetChatId: null });
    beginMock.mockResolvedValue(beginSuccess({ attachments: 2, stored: 1 }));
    getParticipantsMock.mockResolvedValue([
      { id: 'p-1', chatId: 'chat-9', displayName: 'Sara', colorIndex: 0, messageCount: 3 },
      { id: 'p-2', chatId: 'chat-9', displayName: 'Ali Khan', colorIndex: 1, messageCount: 2 },
    ]);

    await renderAndPick(user);
    await waitFor(() => {
      expect(detectMock).toHaveBeenCalledWith(
        expect.anything(),
        'WhatsApp Chat - Family.zip',
        expect.anything(),
        undefined,
      );
    });
    await confirmAsSara(user);

    await screen.findByText('Import complete');
    expect(beginMock).toHaveBeenCalledWith(
      expect.objectContaining({
        fileName: 'WhatsApp Chat - Family.zip',
        title: 'Family',
        isGroup: true,
        targetChatId: null,
      }),
    );
    // §12.8.4: the self choice persists via setSelf after the commit.
    expect(setSelfMock).toHaveBeenCalledWith('chat-9', 'p-1');
    // §12.9: persistent storage is requested exactly once after success.
    expect(persistMock).toHaveBeenCalledTimes(1);
  });

  it('does not request persistent storage when the origin already has it', async () => {
    const user = userEvent.setup();
    persistedMock.mockResolvedValue(true);
    detectMock.mockResolvedValue({ report, suggestedTargetChatId: null });
    beginMock.mockResolvedValue(beginSuccess({ attachments: 0, stored: 0 }));
    getParticipantsMock.mockResolvedValue([]);

    await renderAndPick(user);
    await confirmAsSara(user);
    await screen.findByText('Import complete');
    expect(persistedMock).toHaveBeenCalledTimes(1);
    expect(persistMock).not.toHaveBeenCalled();
  });

  it('still shows the report when setSelf rejects', async () => {
    const user = userEvent.setup();
    setSelfMock.mockRejectedValue(new Error('self failed'));
    detectMock.mockResolvedValue({ report, suggestedTargetChatId: null });
    beginMock.mockResolvedValue(beginSuccess({ attachments: 0, stored: 0 }));
    getParticipantsMock.mockResolvedValue([
      { id: 'p-1', chatId: 'chat-9', displayName: 'Sara', colorIndex: 0, messageCount: 3 },
    ]);

    await renderAndPick(user);
    await confirmAsSara(user);

    // The commit succeeded, so the report shows despite the setSelf failure.
    await screen.findByText('Import complete');
    expect(setSelfMock).toHaveBeenCalledWith('chat-9', 'p-1');
  });

  it('shows the mapped error when detection fails', async () => {
    const user = userEvent.setup();
    detectMock.mockResolvedValue({ code: 'UNRECOGNIZED_FORMAT', detail: 'no headers' });
    await renderAndPick(user);
    await screen.findByText('Import failed');
    expect(screen.getByText('This doesn’t look like a WhatsApp export.')).toBeInTheDocument();
  });

  it('marks CANCELLED when begin reports it (§9.3)', async () => {
    const user = userEvent.setup();
    detectMock.mockResolvedValue({ report, suggestedTargetChatId: null });
    beginMock.mockResolvedValue({ code: 'CANCELLED', detail: 'cancelled during media writes' });
    await renderAndPick(user);
    await screen.findByText('Confirm import');
    await user.click(screen.getByRole('button', { name: 'Start import' }));
    await screen.findByText('Import cancelled. Nothing was imported.');
  });

  it('shows Cancelling… until begin answers, then notes a commit that won the race', async () => {
    const user = userEvent.setup();
    detectMock.mockResolvedValue({ report, suggestedTargetChatId: null });
    let finish: (value: unknown) => void = () => undefined;
    beginMock.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    await renderAndPick(user);
    await screen.findByText('Confirm import');
    await user.click(screen.getByRole('button', { name: 'Start import' }));
    await user.click(await screen.findByRole('button', { name: 'Cancel import' }));

    expect(screen.getByRole('button', { name: 'Cancelling…' })).toBeDisabled();

    finish(beginSuccess({ attachments: 0, stored: 0 }));
    await screen.findByText('Import complete');
    expect(
      screen.getByText('The import finished before it could be cancelled.'),
    ).toBeInTheDocument();
  });

  it('omits the cancel note on a normal successful import', async () => {
    const user = userEvent.setup();
    detectMock.mockResolvedValue({ report, suggestedTargetChatId: null });
    beginMock.mockResolvedValue(beginSuccess({ attachments: 0, stored: 0 }));
    await renderAndPick(user);
    await screen.findByText('Confirm import');
    await user.click(screen.getByRole('button', { name: 'Start import' }));
    await screen.findByText('Import complete');
    expect(screen.queryByText('The import finished before it could be cancelled.')).toBeNull();
  });
});

describe('ImportScreen and the update prompt (§12.12)', () => {
  beforeEach(() => {
    detectMock.mockReset();
    beginMock.mockReset();
    persistedMock.mockResolvedValue(true);
    installGateDone(true);
  });

  it('keeps the update prompt away until begin answers, even after leaving (§12.12)', async () => {
    const user = userEvent.setup();
    detectMock.mockResolvedValue({ report, suggestedTargetChatId: null });
    let answer: (value: unknown) => void = () => undefined;
    beginMock.mockReturnValue(
      new Promise((resolve) => {
        answer = resolve;
      }),
    );
    getParticipantsMock.mockResolvedValue([]);
    const view = await renderAndPick(user);
    await confirmAsSara(user);

    view.unmount();
    renderWithProviders(<LongTaskProbe />);
    expect(screen.getByText('task running')).toBeInTheDocument();
    answer(beginSuccess({ attachments: 0, stored: 0 }));
    await screen.findByText('no task');
  });
});
