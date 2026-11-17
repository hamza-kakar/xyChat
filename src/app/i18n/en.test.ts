import { describe, expect, it } from 'vitest';
import { en } from './en';

/** Collects every leaf string in the i18n tree. */
function collectLeaves(node: unknown, path = ''): readonly [string, unknown][] {
  if (typeof node === 'string') {
    return [[path, node]];
  }
  if (typeof node === 'object' && node !== null) {
    return Object.entries(node).flatMap(([key, value]) =>
      collectLeaves(value, path === '' ? key : `${path}.${key}`),
    );
  }
  return [];
}

describe('i18n en', () => {
  it('only contains non-empty string leaves', () => {
    const leaves = collectLeaves(en);
    expect(leaves.length).toBeGreaterThan(0);
    for (const [path, value] of leaves) {
      expect(typeof value, path).toBe('string');
      expect((value as string).trim().length, path).toBeGreaterThan(0);
    }
  });
});
