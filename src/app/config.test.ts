import { describe, expect, it } from 'vitest';
import { APP_NAME, IMPORT_LIMITS, THUMBNAIL_LONG_EDGE } from './config';

describe('config', () => {
  it('has a non-empty app name', () => {
    expect(APP_NAME.length).toBeGreaterThan(0);
  });

  it('defines positive import safety limits', () => {
    for (const [name, limit] of Object.entries(IMPORT_LIMITS)) {
      expect(limit, name).toBeGreaterThan(0);
    }
  });

  it('caps the text file below the uncompressed total', () => {
    expect(IMPORT_LIMITS.maxTextFileBytes).toBeLessThan(IMPORT_LIMITS.maxUncompressedTotalBytes);
  });

  it('uses a sane thumbnail long edge', () => {
    expect(THUMBNAIL_LONG_EDGE).toBeGreaterThan(0);
  });
});
