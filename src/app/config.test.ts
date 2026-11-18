import { describe, expect, it } from 'vitest';
import { APP_NAME, APP_VERSION } from './config';

describe('config', () => {
  it('has a non-empty app name', () => {
    expect(APP_NAME.length).toBeGreaterThan(0);
  });

  it('exposes the build-time app version', () => {
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+/u);
  });
});
