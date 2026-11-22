import { describe, expect, it } from 'vitest';
import { ALI, attachment, message } from '../../test/fixtures';
import {
  continuesRun,
  describeContent,
  layoutRow,
  messageLabel,
  RUN_GAP_SECONDS,
} from './row-model';

const context = { selfId: null, isGroup: true, locale: 'en-US' };
const at = (minute: number, second = 0) => ({
  tsLocal: { year: 2026, month: 11, day: 17, hour: 21, minute, second },
  tsKey: Date.UTC(2026, 10, 17, 21, minute, second) / 1000,
});

describe('continuesRun', () => {
  it('joins bubbles by one author within five minutes on the same day', () => {
    const first = message({ seq: 0, ...at(0) });
    expect(continuesRun(first, message({ seq: 1, ...at(5) }))).toBe(true);
    expect(continuesRun(first, message({ seq: 1, ...at(5, 1) }))).toBe(false);
    expect(RUN_GAP_SECONDS).toBe(300);
  });

  it('breaks on another author, a system row, a new day or no previous row', () => {
    const first = message({ seq: 0, ...at(0) });
    expect(continuesRun(first, message({ seq: 1, authorId: ALI, ...at(1) }))).toBe(false);
    expect(continuesRun(message({ kind: 'system', authorId: null }), message({ seq: 1 }))).toBe(
      false,
    );
    expect(continuesRun(first, message({ seq: 1, kind: 'system', authorId: null }))).toBe(false);
    const late = message({
      tsLocal: { year: 2026, month: 11, day: 17, hour: 23, minute: 59, second: 0 },
      tsKey: Date.UTC(2026, 10, 17, 23, 59, 0) / 1000,
    });
    const early = message({
      seq: 1,
      tsLocal: { year: 2026, month: 11, day: 18, hour: 0, minute: 1, second: 0 },
      tsKey: Date.UTC(2026, 10, 18, 0, 1, 0) / 1000,
    });
    expect(continuesRun(late, early)).toBe(false);
    expect(continuesRun(undefined, first)).toBe(false);
  });

  it('breaks when time goes backwards (out-of-order export)', () => {
    expect(continuesRun(message({ ...at(5) }), message({ seq: 1, ...at(4) }))).toBe(false);
  });
});

describe('layoutRow', () => {
  it('puts self messages at the end and names only incoming group run starts', () => {
    const first = message({ seq: 0, ...at(0) });
    const second = message({ seq: 1, ...at(1) });
    expect(layoutRow(undefined, first, context)).toEqual({
      showDaySeparator: true,
      isOutgoing: false,
      isRunStart: true,
      showSenderName: true,
    });
    expect(layoutRow(first, second, context)).toMatchObject({
      showDaySeparator: false,
      isRunStart: false,
      showSenderName: false,
    });
    const asSelf = { ...context, selfId: first.authorId };
    expect(layoutRow(undefined, first, asSelf)).toMatchObject({
      isOutgoing: true,
      showSenderName: false,
    });
    expect(layoutRow(undefined, first, { ...context, isGroup: false }).showSenderName).toBe(false);
  });

  it('never treats a system row as outgoing', () => {
    const system = message({ kind: 'system', authorId: null, authorName: null });
    expect(layoutRow(undefined, system, { ...context, selfId: null }).isOutgoing).toBe(false);
  });
});

describe('describeContent and messageLabel', () => {
  it('describes each kind for screen readers', () => {
    expect(describeContent(message({ kind: 'deleted' }))).toBe('This message was deleted');
    expect(describeContent(message({ kind: 'media', body: '', attachments: [attachment()] }))).toBe(
      'Photo',
    );
    expect(
      describeContent(
        message({ kind: 'media', body: 'look', attachments: [attachment({ mediaType: 'voice' })] }),
      ),
    ).toBe('Voice note, look');
    expect(describeContent(message({ kind: 'media', body: '' }))).toBe('File');
    expect(
      describeContent(
        message({
          kind: 'location',
          location: { lat: 24.86, lng: 67.0, url: 'https://maps.google.com/?q=24.86,67' },
        }),
      ),
    ).toBe('Location, 24.86, 67');
    expect(describeContent(message({ kind: 'location' }))).toBe('Location');
    expect(
      describeContent(message({ kind: 'poll', poll: { question: 'Dinner?', options: [] } })),
    ).toBe('Poll, Dinner?');
    expect(describeContent(message({ kind: 'poll', body: 'POLL:' }))).toBe('Poll, POLL:');
    expect(describeContent(message({ kind: 'contact' }))).toBe('Contact');
    expect(describeContent(message({ kind: 'call', body: 'Missed voice call' }))).toBe(
      'Missed voice call',
    );
  });

  it('labels a message with sender, full time and content', () => {
    expect(messageLabel(message(), context)).toMatch(
      /^Sara, Nov 17, 2026, 9:19:03\sPM: hello there$/u,
    );
    expect(
      messageLabel(message({ kind: 'system', authorName: null, body: 'Ali left' }), context),
    ).toMatch(/^System, .*: Ali left$/u);
  });
});
