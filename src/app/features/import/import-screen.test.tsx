/**
 * Import screen container tests (§12.8): the pick → detect → confirm →
 * begin flow with both worker clients mocked (§18.4); the report and
 * error branches.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { installGateDone } from './install-gate-state';
import { ImportScreen } from './import-screen';
import type { DetectReport } from '../../../workers/import-detect';

const detectMock = vi.hoisted(() => vi.fn());
const beginMock = vi.hoisted(() => vi.fn());
const getParticipantsMock = vi.hoisted(() => vi.fn());
const setSelfMock = vi.hoisted(() => vi.fn());

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
      setSelfMock(...args);
      return Promise.resolve();
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

describe('ImportScreen (§12.8)', () => {
  beforeEach(() => {
    detectMock.mockReset();
    beginMock.mockReset();
    getParticipantsMock.mockReset();
    setSelfMock.mockReset();
    installGateDone(true);
  });

  it('runs pick → detect → confirm and starts the import', async () => {
    const user = userEvent.setup();
    detectMock.mockResolvedValue({ report, suggestedTargetChatId: null });
    beginMock.mockResolvedValue({
      commit: {
        chatId: 'chat-9',
        importId: 'imp-1',
        messagesInserted: 5,
        duplicatesSkipped: 0,
        attachmentsInserted: 2,
        mediaUpgraded: 0,
      },
      report: {
        warningsByCode: {},
        stats: { lines: 8, messages: 5, system: 0, media: 2 },
        replacementChars: 0,
        durationMs: 900,
        mediaStored: 1,
        mediaMissing: 1,
        mediaOmitted: 0,
      },
      chatId: 'chat-9',
    });
    getParticipantsMock.mockResolvedValue([
      { id: 'p-1', chatId: 'chat-9', displayName: 'Sara', colorIndex: 0, messageCount: 3 },
      { id: 'p-2', chatId: 'chat-9', displayName: 'Ali Khan', colorIndex: 1, messageCount: 2 },
    ]);

    render(
      <MemoryRouter>
        <ImportScreen />
      </MemoryRouter>,
    );
    await user.click(screen.getByRole('button', { name: 'Choose export file (.zip or .txt)' }));
    const input = document.querySelector('input[type="file"]');
    expect(input).not.toBeNull();
    if (input === null) {
      return;
    }
    fireEvent.change(input, { target: { files: [pickedFile()] } });

    await waitFor(() => {
      expect(detectMock).toHaveBeenCalledWith(
        expect.anything(),
        'WhatsApp Chat - Family.zip',
        expect.anything(),
        undefined,
      );
    });
    await screen.findByText('Confirm import');
    const sara = screen.getAllByRole('button', { name: 'Sara' })[0];
    if (sara !== undefined) {
      await user.click(sara);
    }
    await user.click(screen.getByRole('button', { name: 'Start import' }));

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
  });

  it('shows the mapped error when detection fails', async () => {
    const user = userEvent.setup();
    detectMock.mockResolvedValue({ code: 'UNRECOGNIZED_FORMAT', detail: 'no headers' });
    render(
      <MemoryRouter>
        <ImportScreen />
      </MemoryRouter>,
    );
    await user.click(screen.getByRole('button', { name: 'Choose export file (.zip or .txt)' }));
    const input = document.querySelector('input[type="file"]');
    if (input !== null) {
      fireEvent.change(input, { target: { files: [pickedFile()] } });
    }
    await screen.findByText('Import failed');
    expect(screen.getByText('This doesn’t look like a WhatsApp export.')).toBeInTheDocument();
  });

  it('marks CANCELLED when begin reports it (§9.3)', async () => {
    const user = userEvent.setup();
    detectMock.mockResolvedValue({ report, suggestedTargetChatId: null });
    beginMock.mockResolvedValue({ code: 'CANCELLED', detail: 'cancelled during media writes' });
    render(
      <MemoryRouter>
        <ImportScreen />
      </MemoryRouter>,
    );
    await user.click(screen.getByRole('button', { name: 'Choose export file (.zip or .txt)' }));
    const input = document.querySelector('input[type="file"]');
    if (input !== null) {
      fireEvent.change(input, { target: { files: [pickedFile()] } });
    }
    await screen.findByText('Confirm import');
    await user.click(screen.getByRole('button', { name: 'Start import' }));
    await screen.findByText('Import cancelled. Nothing was imported.');
  });
});
