import { describe, expect, it } from 'vitest';
import { rpcBackupInput } from './rpc-validate-backup';
import { RpcValidationError } from './rpc-validate';

describe('rpcBackupInput', () => {
  it('accepts a selection of all chats or some', () => {
    expect(rpcBackupInput.selection('m', { chatIds: null, includeMedia: true })).toEqual({
      chatIds: null,
      includeMedia: true,
    });
    expect(rpcBackupInput.selection('m', { chatIds: ['a'], includeMedia: false }).chatIds).toEqual([
      'a',
    ]);
  });

  it('rejects malformed selections and requests', () => {
    expect(() => rpcBackupInput.selection('m', { chatIds: [''], includeMedia: true })).toThrow(
      RpcValidationError,
    );
    expect(() =>
      rpcBackupInput.backupRequest('m', { chatIds: null, includeMedia: true, appName: '' }),
    ).toThrow(RpcValidationError);
    expect(
      rpcBackupInput.backupRequest('m', {
        chatIds: null,
        includeMedia: false,
        appName: 'App',
        appVersion: '1.0.0',
      }).appName,
    ).toBe('App');
  });

  it('checks files, names and decisions', () => {
    const blob = new Blob(['x']);
    expect(rpcBackupInput.file('m', blob)).toBe(blob);
    expect(() => rpcBackupInput.file('m', 'not a file')).toThrow(RpcValidationError);
    expect(rpcBackupInput.fileName('m', 'b.zip')).toBe('b.zip');
    expect(() => rpcBackupInput.fileName('m', '')).toThrow(RpcValidationError);
    const decisions = [{ backupChatId: 'c', choice: 'merge', targetChatId: 'd' }];
    expect(rpcBackupInput.decisions('m', decisions)).toEqual(decisions);
    expect(() =>
      rpcBackupInput.decisions('m', [{ backupChatId: 'c', choice: 'delete', targetChatId: null }]),
    ).toThrow(RpcValidationError);
  });
});
