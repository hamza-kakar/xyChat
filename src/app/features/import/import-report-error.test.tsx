/**
 * Report + error step tests (§12.8.6): counts, media split, warnings,
 * decoding note, and the plain-language error mapping with diagnostics
 * copy (§18.7 — codes/counts only).
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { ImportReportStep } from './import-report-step';
import { ImportErrorStep } from './import-error-step';
import { newChatId } from '../../../core/ids';
import type { BeginOutcome } from '../../../client/import-client';

const chatId = newChatId();
const outcome: BeginOutcome = {
  commit: {
    chatId,
    importId: 'imp-1',
    messagesInserted: 6,
    duplicatesSkipped: 2,
    attachmentsInserted: 3,
    mediaUpgraded: 1,
  },
  report: {
    warningsByCode: { OUT_OF_ORDER_TIMESTAMP: 3 },
    stats: { lines: 10, messages: 6, system: 0, media: 2 },
    replacementChars: 4,
    durationMs: 2_300,
    mediaStored: 1,
    mediaMissing: 1,
    mediaOmitted: 1,
  },
  chatId,
};

describe('ImportReportStep (§12.8.6)', () => {
  it('renders counts, the media split, duration and warning grouping', () => {
    render(
      <MemoryRouter>
        <ImportReportStep outcome={outcome} onOpenChat={() => undefined} />
      </MemoryRouter>,
    );
    expect(screen.getByText('6 messages imported')).toBeInTheDocument();
    expect(screen.getByText('2 duplicates skipped')).toBeInTheDocument();
    expect(screen.getByText('1 media files stored')).toBeInTheDocument();
    expect(screen.getByText('1 media files missing from the archive')).toBeInTheDocument();
    expect(screen.getByText('1 media omitted by the export')).toBeInTheDocument();
    expect(screen.getByText('1 media upgraded')).toBeInTheDocument();
    expect(screen.getByText('Finished in 2.3 s')).toBeInTheDocument();
    expect(screen.getByText(/4 unreadable characters/)).toBeInTheDocument();
    expect(screen.getByText(/out of chronological order/)).toBeInTheDocument();
  });

  it('opens the chat via the §12.8.6 button', async () => {
    const user = userEvent.setup();
    const onOpenChat = vi.fn();
    render(
      <MemoryRouter>
        <ImportReportStep outcome={outcome} onOpenChat={onOpenChat} />
      </MemoryRouter>,
    );
    await user.click(screen.getByRole('button', { name: 'Open chat' }));
    expect(onOpenChat).toHaveBeenCalledTimes(1);
  });
});

describe('ImportErrorStep (§12.8)', () => {
  it('maps a typed code to plain language and offers diagnostics copy', async () => {
    const user = userEvent.setup();
    const written: string[] = [];
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: vi.fn((text: string) => {
          written.push(text);
          return Promise.resolve();
        }),
        readText: vi.fn(() => Promise.resolve(written.at(-1) ?? '')),
      },
      configurable: true,
    });
    render(
      <ImportErrorStep
        error={{ code: 'QUOTA_EXCEEDED', detail: 'free 10, required 99' }}
        onRetry={() => undefined}
      />,
    );
    expect(
      screen.getByText('Not enough free storage on this device for this export.'),
    ).toBeInTheDocument();
    await user.click(screen.getByText('Copy diagnostic details'));
    expect(written).toHaveLength(1);
    expect(written[0]).toContain('QUOTA_EXCEEDED');
  });

  it('shows the cancelled message on CANCELLED (§9.3)', () => {
    render(<ImportErrorStep error={{ code: 'CANCELLED', detail: '' }} onRetry={() => undefined} />);
    expect(screen.getByText('Import cancelled. Nothing was imported.')).toBeInTheDocument();
  });

  it('retries via the button', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(<ImportErrorStep error={{ code: 'INTERNAL', detail: '' }} onRetry={onRetry} />);
    await user.click(screen.getByRole('button', { name: 'Try another file' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
