/**
 * Confirm-step tests (§12.8.4): the ambiguous-order toggle re-runs
 * detection with the chosen order; the title edit and start button carry
 * the confirmed choices.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ImportConfirmStep } from './import-confirm-step';
import type { DetectReport } from '../../../workers/import-detect';

/** A detect report for an ambiguous iOS group export (§12.8.4). */
function reportWith(orderSource: 'unambiguous' | 'locale-hint' | 'user'): DetectReport {
  return {
    format: {
      platform: 'ios',
      headerPatternId: 'ios-bracket',
      dateOrder: 'DMY',
      dateOrderSource: orderSource,
      clock: '12h',
      hasSeconds: true,
      confidence: 0.9,
      sampleMessages: [
        {
          seq: 0,
          sourceLine: 1,
          timestamp: { year: 2026, month: 11, day: 17, hour: 21, minute: 19, second: 3 },
          author: 'Sara',
          kind: 'text',
          body: 'hello there',
          isEdited: false,
          attachment: null,
          poll: null,
          location: null,
        },
      ],
    },
    title: 'Family',
    isGroup: true,
    participants: ['Sara', 'Ali Khan'],
    archiveBytes: 1234,
    freeBytes: 3_500_000,
    uncompressedTotalBytes: 2345,
    replacementChars: 0,
    messagesCount: 1,
    mediaFilesFound: 1,
    mediaFilesMissing: 0,
  };
}

const file = new File(['x'], 'WhatsApp Chat - Family.zip');

describe('ImportConfirmStep (§12.8.4)', () => {
  it('shows the DMY/MDY toggle when the order is ambiguous and calls onDateOrder', async () => {
    const user = userEvent.setup();
    const onDateOrder = vi.fn();
    render(
      <ImportConfirmStep
        report={reportWith('locale-hint')}
        file={file}
        suggestedTargetChatId={null}
        reorderRunning={false}
        onDateOrder={onDateOrder}
        onStart={() => undefined}
        onBack={() => undefined}
      />,
    );
    expect(screen.getByText(/ambiguous/u)).toBeInTheDocument();
    await user.click(screen.getByText('Month / Day'));
    expect(onDateOrder).toHaveBeenCalledWith('MDY');
  });

  it('hides the toggle when the order is unambiguous', () => {
    render(
      <ImportConfirmStep
        report={reportWith('unambiguous')}
        file={file}
        suggestedTargetChatId={null}
        reorderRunning={false}
        onDateOrder={() => undefined}
        onStart={() => undefined}
        onBack={() => undefined}
      />,
    );
    expect(screen.queryByText('Day / Month')).not.toBeInTheDocument();
  });

  it('starts with the edited title and self choice', async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    render(
      <ImportConfirmStep
        report={reportWith('unambiguous')}
        file={file}
        suggestedTargetChatId={null}
        reorderRunning={false}
        onDateOrder={() => undefined}
        onStart={onStart}
        onBack={() => undefined}
      />,
    );
    const input = screen.getByLabelText('Chat name');
    await user.clear(input);
    await user.type(input, 'My Family');
    await user.click(screen.getByText('Ali Khan'));
    await user.click(screen.getByText('Start import'));
    expect(onStart).toHaveBeenCalledWith(
      expect.anything(),
      file,
      expect.objectContaining({ confirmedTitle: 'My Family', selfName: 'Ali Khan' }),
    );
  });
});
