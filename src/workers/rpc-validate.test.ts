/**
 * RPC input validation tests (§18.5, review Major 9): every validator
 * rejects malformed worker input with RpcValidationError and passes fully
 * valid data through unchanged.
 */
import { describe, expect, it } from 'vitest';
import { RpcValidationError, rpcInput } from './rpc-validate';

const VALID_TS = { year: 2026, month: 11, day: 17, hour: 21, minute: 0, second: 0 };
const FP = 'a'.repeat(32);

function validCommitInput(overrides: {
  readonly fingerprint?: string;
  readonly body?: string;
}): Record<string, unknown> {
  return {
    importId: 'imp-1',
    targetChatId: null,
    newChat: { title: 'Chat', isGroup: false, sourcePlatform: 'android', dateOrder: 'DMY' },
    messages: [
      {
        fingerprint: overrides.fingerprint ?? FP,
        message: {
          seq: 0, sourceLine: 1, timestamp: VALID_TS, author: 'Sara',
          kind: 'text', body: overrides.body ?? 'hello', isEdited: false,
          attachment: null, poll: null, location: null,
        },
      },
    ],
    attachments: [],
    fileName: 'chat.txt',
    fileBytes: 100,
    parserVersion: '1.0.0',
  };
}

describe('RPC input validation (§18.5, review Major 9)', () => {
  it('rejects non-hex fingerprints', () => {
    expect(() => rpcInput.commitImport('commitImport', validCommitInput({ fingerprint: 'zz' })))
      .toThrow(RpcValidationError);
  });

  it('rejects out-of-range timestamps', () => {
    const input = validCommitInput({});
    const messages = input['messages'] as { message: { timestamp: unknown } }[];
    messages[0]!.message.timestamp = { ...VALID_TS, month: 13 };
    expect(() => rpcInput.commitImport('commitImport', input)).toThrow(RpcValidationError);
  });

  it('rejects unknown message kinds and oversized bodies', () => {
    const badKind = validCommitInput({});
    const messages = badKind['messages'] as { message: { kind: string } }[];
    messages[0]!.message.kind = 'sticker-note';
    expect(() => rpcInput.commitImport('commitImport', badKind)).toThrow(RpcValidationError);

    const hugeBody = validCommitInput({ body: 'x'.repeat(100_001) });
    expect(() => rpcInput.commitImport('commitImport', hugeBody)).toThrow(RpcValidationError);
  });

  it('passes a fully valid commit input', () => {
    const parsed = rpcInput.commitImport('commitImport', validCommitInput({}));
    expect(parsed.messages).toHaveLength(1);
    expect(parsed.messages[0]?.fingerprint).toBe(FP);
  });

  it('rejects bad search queries and clamps nothing silently', () => {
    const base = { chatId: null, query: 'needle', authorId: null, kinds: null, dateFromTsKey: null, dateToTsKey: null, limit: 50, cursor: null };
    expect(() => rpcInput.search('search', { ...base, query: '' })).toThrow(RpcValidationError);
    expect(() => rpcInput.search('search', { ...base, limit: 501 })).toThrow(RpcValidationError);
    expect(() => rpcInput.search('search', { ...base, cursor: { tsKey: -1, rowId: 0, seq: 0 } }))
      .toThrow(RpcValidationError);
    const parsed = rpcInput.search('search', base);
    expect(parsed.query).toBe('needle');
  });

  it('rejects out-of-range coordinates in location payloads', () => {
    const input = validCommitInput({});
    const messages = input['messages'] as { message: { kind: string; location: unknown } }[];
    messages[0]!.message.kind = 'location';
    messages[0]!.message.location = { lat: 999, lng: 0, url: 'https://maps.example/1' };
    expect(() => rpcInput.commitImport('commitImport', input)).toThrow(RpcValidationError);
  });

  it('brands ids only after length validation', () => {
    expect(rpcInput.chatId('getChat', 'chat-123')).toBe('chat-123');
    expect(() => rpcInput.chatId('getChat', '')).toThrow(RpcValidationError);
    expect(rpcInput.participantId('setSelf', null)).toBeNull();
    expect(() => rpcInput.participantId('setSelf', 42)).toThrow(RpcValidationError);
  });

  it('validates message-window and import-record inputs', () => {
    expect(() =>
      rpcInput.messageWindow('getMessageWindow', { chatId: 'c', anchorSeq: 0, before: -1, after: 5 }),
    ).toThrow(RpcValidationError);
    expect(() =>
      rpcInput.messageWindow('getMessageWindow', { chatId: 'c', anchorSeq: 0, before: 1001, after: 5 }),
    ).toThrow(RpcValidationError);
    expect(rpcInput.messageWindow('getMessageWindow', { chatId: 'c', anchorSeq: 3, before: 10, after: 10 }))
      .toEqual({ chatId: 'c', anchorSeq: 3, before: 10, after: 10 });
    expect(() => rpcInput.importRecord('createImportRecord', { importId: 'i', fileName: '', fileBytes: 1, parserVersion: '1' }))
      .toThrow(RpcValidationError);
  });

  it('validates written-path lists and rejects traversal (§15.2)', () => {
    expect(rpcInput.writtenPaths('recordWrittenPaths', ['media/c/a.jpg'])).toEqual(['media/c/a.jpg']);
    expect(() => rpcInput.writtenPaths('recordWrittenPaths', [''])).toThrow(RpcValidationError);
    expect(() => rpcInput.writtenPaths('recordWrittenPaths', ['../escape'])).toThrow(
      RpcValidationError,
    );
    expect(() => rpcInput.writtenPaths('recordWrittenPaths', ['/abs/path'])).toThrow(
      RpcValidationError,
    );
  });
});
