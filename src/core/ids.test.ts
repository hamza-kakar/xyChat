import { afterEach, describe, expect, it } from 'vitest';
import {
  asAttachmentId,
  asBookmarkId,
  asChatId,
  asImportId,
  asMessageId,
  asParticipantId,
  newAttachmentId,
  newBookmarkId,
  newChatId,
  newImportId,
  newParticipantId,
  type ChatId,
} from './ids';

const originalCrypto = globalThis.crypto;

afterEach(() => {
  Object.defineProperty(globalThis, 'crypto', { value: originalCrypto });
});

describe('id constructors', () => {
  it('generates unique chat ids', () => {
    expect(newChatId()).not.toBe(newChatId());
  });

  it('generates unique participant ids', () => {
    expect(newParticipantId()).not.toBe(newParticipantId());
  });

  it('generates unique attachment ids', () => {
    expect(newAttachmentId()).not.toBe(newAttachmentId());
  });

  it('generates unique import ids', () => {
    expect(newImportId()).not.toBe(newImportId());
  });

  it('generates unique bookmark ids', () => {
    expect(newBookmarkId()).not.toBe(newBookmarkId());
  });

  it('throws a clear error when the runtime lacks crypto.randomUUID', () => {
    Object.defineProperty(globalThis, 'crypto', { value: undefined });
    expect(() => newChatId()).toThrow('crypto.randomUUID unavailable');
  });
});

describe('raw-string casts (rows.ts-only helpers)', () => {
  const raw = '00000000-0000-4000-8000-000000000001';

  it('casts every id kind', () => {
    expect(asChatId(raw)).toBe(raw);
    expect(asParticipantId(raw)).toBe(raw);
    expect(asMessageId(raw)).toBe(raw);
    expect(asAttachmentId(raw)).toBe(raw);
    expect(asImportId(raw)).toBe(raw);
    expect(asBookmarkId(raw)).toBe(raw);
  });

  it('branded ids remain plain strings at runtime', () => {
    const id: ChatId = asChatId(raw);
    expect(typeof id).toBe('string');
  });
});
