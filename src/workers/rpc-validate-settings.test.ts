import { describe, expect, it } from 'vitest';
import { rpcSettingsInput } from './rpc-validate-settings';
import { RpcValidationError } from './rpc-validate';

describe('rpcSettingsInput', () => {
  it('accepts any short PIN attempt and rejects long or non-string input', () => {
    expect(rpcSettingsInput.pinAttempt('m', '12')).toBe('12');
    expect(() => rpcSettingsInput.pinAttempt('m', 'x'.repeat(65))).toThrow(RpcValidationError);
    expect(() => rpcSettingsInput.pinAttempt('m', 1234)).toThrow(RpcValidationError);
  });

  it('requires a 4–8 digit new PIN, or null to turn the lock off', () => {
    expect(rpcSettingsInput.changePin('m', { current: null, next: '1234' })).toEqual({
      current: null,
      next: '1234',
    });
    expect(rpcSettingsInput.changePin('m', { current: '1234', next: null })).toEqual({
      current: '1234',
      next: null,
    });
    expect(() => rpcSettingsInput.changePin('m', { current: null, next: '12' })).toThrow(
      /PIN must be 4–8 digits/u,
    );
  });

  it('never echoes the PIN in the error', () => {
    try {
      rpcSettingsInput.changePin('changePin', { current: null, next: '98a' });
    } catch (error) {
      expect(String(error)).not.toContain('98a');
    }
    expect.assertions(1);
  });

  it('accepts only the offered auto-lock delays', () => {
    expect(rpcSettingsInput.autoLockMinutes('m', 5)).toBe(5);
    expect(() => rpcSettingsInput.autoLockMinutes('m', 2)).toThrow(RpcValidationError);
  });

  it('validates log entries', () => {
    const entry = { timestamp: 1, level: 'warn', code: 'rpc.failed', data: { method: 'x' } };
    expect(rpcSettingsInput.logs('m', [entry])).toEqual([entry]);
    expect(() => rpcSettingsInput.logs('m', [{ ...entry, level: 'debug' }])).toThrow(
      RpcValidationError,
    );
    expect(() => rpcSettingsInput.logs('m', new Array(201).fill(entry))).toThrow(
      RpcValidationError,
    );
  });
});
