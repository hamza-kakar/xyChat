import { describe, expect, it } from 'vitest';
import { err, ok, type Result } from './result';

describe('Result', () => {
  it('ok carries a value and ok flag', () => {
    expect(ok(42)).toEqual({ ok: true, value: 42 });
  });

  it('err carries a typed error code', () => {
    const result: Result<number, 'BAD'> = err('BAD');
    expect(result).toEqual({ ok: false, error: 'BAD' });
  });

  it('discriminates cleanly in a switch', () => {
    const results: Result<string, 'A' | 'B'>[] = [ok('x'), err('A')];
    const out = results.map((r) => (r.ok ? `value:${r.value}` : `error:${r.error}`));
    expect(out).toEqual(['value:x', 'error:A']);
  });
});
