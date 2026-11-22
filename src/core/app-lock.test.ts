import { describe, expect, it } from 'vitest';
import {
  FREE_PIN_ATTEMPTS,
  constantTimeEqual,
  isValidPin,
  lockoutMsAfterFailures,
} from './app-lock';

describe('isValidPin', () => {
  it.each(['1234', '12345678', '0000'])('accepts %s', (pin) => {
    expect(isValidPin(pin)).toBe(true);
  });

  it.each(['', '123', '123456789', '12a4', ' 1234', '١٢٣٤'])('rejects %j', (pin) => {
    expect(isValidPin(pin)).toBe(false);
  });
});

describe('lockoutMsAfterFailures', () => {
  it('allows the free attempts without delay', () => {
    for (let failures = 0; failures < FREE_PIN_ATTEMPTS; failures += 1) {
      expect(lockoutMsAfterFailures(failures)).toBe(0);
    }
  });

  it('doubles from 30 seconds after the fifth failure', () => {
    expect(lockoutMsAfterFailures(5)).toBe(30_000);
    expect(lockoutMsAfterFailures(6)).toBe(60_000);
    expect(lockoutMsAfterFailures(7)).toBe(120_000);
  });

  it('stops growing at one day', () => {
    expect(lockoutMsAfterFailures(30)).toBe(86_400_000);
    expect(lockoutMsAfterFailures(10_000)).toBe(86_400_000);
  });
});

describe('constantTimeEqual', () => {
  it('matches equal bytes', () => {
    expect(constantTimeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3]))).toBe(true);
  });

  it('rejects different bytes and different lengths', () => {
    expect(constantTimeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 4]))).toBe(false);
    expect(constantTimeEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2, 0]))).toBe(false);
    expect(constantTimeEqual(new Uint8Array([]), new Uint8Array([]))).toBe(true);
  });
});
