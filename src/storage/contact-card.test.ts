import { describe, expect, it, vi } from 'vitest';
import { asAttachmentId, asChatId } from '../core/ids';
import { IMPORT_LIMITS } from '../core/limits';
import { readContactName, storedContactCard } from './contact-card';
import type { Attachment } from './repository';

function attachment(over: Partial<Attachment>): Attachment {
  return {
    id: asAttachmentId('att-1'),
    messageId: 7,
    chatId: asChatId('chat-1'),
    fileName: 'Ali.vcf',
    mediaType: 'contact-card',
    mime: 'text/vcard',
    byteSize: 40,
    opfsPath: 'media/chat-1/att-1.vcf',
    thumbPath: null,
    width: null,
    height: null,
    durationMs: null,
    status: 'present',
    ...over,
  };
}

const card = 'BEGIN:VCARD\nVERSION:3.0\nFN:Ali Khan\nEND:VCARD';

describe('storedContactCard', () => {
  it('ignores other media types and cards that are not stored', () => {
    expect(storedContactCard([attachment({ mediaType: 'image' })])).toBeNull();
    expect(storedContactCard([attachment({ status: 'missing', opfsPath: null })])).toBeNull();
    expect(storedContactCard([attachment({ opfsPath: null })])).toBeNull();
    expect(storedContactCard([attachment({})])?.id).toBe('att-1');
  });
});

describe('readContactName', () => {
  it('reads the FN name of the stored card', async () => {
    const readFile = vi.fn(() => Promise.resolve(new Blob([card])));
    await expect(readContactName([attachment({})], readFile)).resolves.toBe('Ali Khan');
    expect(readFile).toHaveBeenCalledWith('media/chat-1/att-1.vcf');
  });

  it('returns null without reading when there is no stored card', async () => {
    const readFile = vi.fn(() => Promise.resolve(new Blob([card])));
    await expect(readContactName([], readFile)).resolves.toBeNull();
    expect(readFile).not.toHaveBeenCalled();
  });

  it('returns null for a missing file or one over the size cap', async () => {
    await expect(
      readContactName([attachment({})], () => Promise.resolve(null)),
    ).resolves.toBeNull();
    const huge = new Blob([new Uint8Array(IMPORT_LIMITS.maxVcfBytes + 1)]);
    await expect(
      readContactName([attachment({})], () => Promise.resolve(huge)),
    ).resolves.toBeNull();
  });
});
