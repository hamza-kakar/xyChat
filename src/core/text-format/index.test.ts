import { describe, expect, it } from 'vitest';
import { astLeafText, parseText } from './index';

describe('parseText', () => {
  it('returns plain text spans unchanged', () => {
    const ast = parseText('plain text');
    expect(ast.spans).toEqual([
      { type: 'paragraph', spans: [{ type: 'text', text: 'plain text' }] },
    ]);
  });

  it('tokenizes bold, italic, strike and mono', () => {
    const ast = parseText('*b* _i_ ~s~ `m`');
    const [paragraph] = ast.spans;
    expect(paragraph?.spans).toEqual([
      { type: 'bold', children: [{ type: 'text', text: 'b' }] },
      { type: 'text', text: ' ' },
      { type: 'italic', children: [{ type: 'text', text: 'i' }] },
      { type: 'text', text: ' ' },
      { type: 'strike', children: [{ type: 'text', text: 's' }] },
      { type: 'text', text: ' ' },
      { type: 'mono', text: 'm' },
    ]);
  });

  it('tokenizes monospace blocks verbatim', () => {
    const ast = parseText('```a *b* c```');
    expect(astLeafText(ast)).toBe('a *b* c');
  });

  it('keeps multi-line monospace content exactly', () => {
    const ast = parseText('```\nline1\nline2\n```');
    expect(astLeafText(ast)).toBe('\nline1\nline2\n');
  });

  it('treats unterminated markers as literal text', () => {
    const ast = parseText('a * b _ c');
    expect(astLeafText(ast)).toBe('a * b _ c');
  });

  it('treats unterminated fences as verbatim blocks', () => {
    const ast = parseText('x ```\ncode');
    expect(astLeafText(ast)).toBe('x \ncode');
  });

  it('recognizes quotes, bullets and numbered lists', () => {
    const ast = parseText('> quoted\n- bullet\n1. first');
    expect(ast.spans.map((s) => s.type)).toEqual([
      'quote',
      'paragraph',
      'bullet',
      'paragraph',
      'numbered',
    ]);
    const numbered = ast.spans.at(-1);
    expect(numbered?.type === 'numbered' ? numbered.number : 0).toBe(1);
  });

  it('preserves newlines as leaf text', () => {
    expect(astLeafText(parseText('a\nb'))).toBe('a\nb');
  });

  it('never loses text on adversarial nesting', () => {
    const ast = parseText('*_nested~x~_* done `a`b`');
    expect(astLeafText(ast)).toBe('nestedx done ab`');
  });
});
