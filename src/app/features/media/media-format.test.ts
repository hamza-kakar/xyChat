import { describe, expect, it } from 'vitest';
import { formatClock, galleryItemLabel } from './media-format';
import type { GalleryItemView } from '../../../client/db-client';
import { asAttachmentId, asChatId } from '../../../core/ids';

describe('media display helpers', () => {
  it('formats playback clocks', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(7.9)).toBe('0:07');
    expect(formatClock(65)).toBe('1:05');
    expect(formatClock(3723)).toBe('1:02:03');
    expect(formatClock(Number.NaN)).toBe('0:00');
    expect(formatClock(Number.POSITIVE_INFINITY)).toBe('0:00');
    expect(formatClock(-3)).toBe('0:00');
  });

  it('labels gallery items with type, sender and date', () => {
    const item: GalleryItemView = {
      attachment: {
        id: asAttachmentId('a1'),
        messageId: 1,
        chatId: asChatId('c1'),
        fileName: 'voice.opus',
        mediaType: 'voice',
        mime: 'audio/ogg',
        byteSize: 10,
        opfsPath: 'media/c1/a1.opus',
        thumbPath: null,
        width: null,
        height: null,
        durationMs: null,
        status: 'present',
      },
      message: {
        messageRowId: 1,
        seq: 0,
        authorName: null,
        tsLocal: { year: 2026, month: 11, day: 17, hour: 21, minute: 0, second: 0 },
      },
    };
    expect(galleryItemLabel(item, 'en-US')).toBe('Voice note, Unknown sender, Nov 17, 2026');
  });
});
