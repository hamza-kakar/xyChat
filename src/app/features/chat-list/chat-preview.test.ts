import { describe, expect, it } from 'vitest';
import { chatSummary } from '../../test/fixtures';
import { chatPreview } from './chat-preview';
import { initialsOf, paletteIndexFor, PALETTE_SIZE } from './avatar-color';

describe('chatPreview', () => {
  it('prefixes the sender in groups but not in 1:1 chats or for system rows', () => {
    expect(chatPreview(chatSummary())).toBe('Sara: see you soon');
    expect(chatPreview(chatSummary({ isGroup: false }))).toBe('see you soon');
    expect(
      chatPreview(
        chatSummary({
          lastMessageKind: 'system',
          lastAuthorName: null,
          lastMessagePreview: 'Ali left',
        }),
      ),
    ).toBe('Ali left');
  });

  it('labels media with its type and keeps a caption', () => {
    expect(
      chatPreview(
        chatSummary({ lastMessageKind: 'media', lastMediaType: 'image', lastMessagePreview: '' }),
      ),
    ).toBe('Sara: Photo');
    expect(
      chatPreview(
        chatSummary({
          lastMessageKind: 'media',
          lastMediaType: 'voice',
          lastMessagePreview: 'listen',
        }),
      ),
    ).toBe('Sara: Voice note · listen');
    expect(
      chatPreview(
        chatSummary({ lastMessageKind: 'media', lastMediaType: null, lastMessagePreview: '' }),
      ),
    ).toBe('Sara: File');
  });

  it('labels the other kinds', () => {
    const kinds = [
      ['deleted', 'Message deleted'],
      ['location', 'Location'],
      ['contact', 'Contact'],
      ['poll', 'Poll'],
    ] as const;
    for (const [kind, label] of kinds) {
      expect(chatPreview(chatSummary({ isGroup: false, lastMessageKind: kind }))).toBe(label);
    }
    expect(
      chatPreview(
        chatSummary({
          isGroup: false,
          lastMessageKind: 'call',
          lastMessagePreview: 'Missed voice call',
        }),
      ),
    ).toBe('Missed voice call');
    expect(
      chatPreview(chatSummary({ isGroup: false, lastMessageKind: 'call', lastMessagePreview: '' })),
    ).toBe('Call');
    expect(
      chatPreview(
        chatSummary({ lastMessageKind: null, lastAuthorName: null, lastMessagePreview: null }),
      ),
    ).toBe('No messages');
  });
});

describe('avatar colors and initials', () => {
  it('maps a title to a stable palette index', () => {
    const index = paletteIndexFor('Family');
    expect(index).toBe(paletteIndexFor('Family'));
    expect(index).toBeGreaterThanOrEqual(0);
    expect(index).toBeLessThan(PALETTE_SIZE);
    const spread = new Set(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map(paletteIndexFor));
    expect(spread.size).toBeGreaterThan(3);
  });

  it('takes up to two initials by grapheme', () => {
    expect(initialsOf('ali khan bro')).toBe('AK');
    expect(initialsOf('  Sara  ')).toBe('S');
    expect(initialsOf('👨‍👩‍👧 Family')).toBe('👨‍👩‍👧F');
    expect(initialsOf('علی خان')).toBe('عخ');
    expect(initialsOf('')).toBe('');
  });
});
