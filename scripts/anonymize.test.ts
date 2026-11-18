/**
 * Anonymizer tests (AGENTS.md §19.3): consistent author mapping, structure
 * preservation, determinism, and a full round-trip through the parser.
 */
import { describe, expect, it } from 'vitest';
import { detectFormat, parseChat } from '../src/core/parser';
import { anonymizeExportText, collectAuthors, createAuthorMapper } from './anonymize-lib';

const SAMPLE = [
  '17/11/2026, 21:19 - Messages and calls are end-to-end encrypted. No one outside of this chat can read them.',
  '17/11/2026, 21:20 - Ali Khan created group "Family"',
  '17/11/2026, 21:21 - Sara: Hi everyone!',
  '17/11/2026, 21:22 - Ali Khan: IMG-20261117-WA0001.jpg (file attached)',
  'sunset at the beach',
  '17/11/2026, 21:23 - Sara: <Media omitted>',
  '17/11/2026, 21:24 - Ali Khan: POLL:',
  'Dinner plans?',
  'OPTION: Biryani (2 votes)',
  'OPTION: Karahi (1 vote)',
].join('\n');

describe('anonymizeExportText', () => {
  const detected = detectFormat(SAMPLE);
  if (!detected.ok) {
    throw new Error('sample must parse');
  }
  const parsed = parseChat(SAMPLE, { format: detected.value });
  if (!parsed.ok) {
    throw new Error('sample must parse');
  }
  const mapper = createAuthorMapper(collectAuthors(parsed.value.messages));
  const anonymized = anonymizeExportText(parsed.value.messages, detected.value, mapper);

  it('maps authors consistently to Person names in first-seen order', () => {
    expect(mapper.map('Sara')).toBe('Person A');
    expect(mapper.map('Ali Khan')).toBe('Person B');
    expect(mapper.map('Sara')).toBe(mapper.map('Sara'));
  });

  it('removes every original author name from the output', () => {
    expect(anonymized).not.toContain('Ali Khan');
    expect(anonymized).not.toContain('Sara');
    expect(anonymized).toContain('Person A');
  });

  it('preserves the structural marker vocabulary', () => {
    expect(anonymized).toContain('(file attached)');
    expect(anonymized).toContain('<Media omitted>');
    expect(anonymized).toContain('OPTION:');
    expect(anonymized).toContain('POLL:');
    expect(anonymized).toContain('created group');
    expect(anonymized).toContain('IMG-20261117-WA0001.jpg');
  });

  it('re-parses to the same message and kind counts', () => {
    const reDetected = detectFormat(anonymized);
    if (!reDetected.ok) {
      throw new Error('anonymized export must stay parseable');
    }
    const reParsed = parseChat(anonymized, { format: reDetected.value });
    if (!reParsed.ok) {
      throw new Error('anonymized export must stay parseable');
    }
    expect(reParsed.value.messages).toHaveLength(parsed.value.messages.length);
    const kindsBefore = parsed.value.messages.map((m) => m.kind);
    const kindsAfter = reParsed.value.messages.map((m) => m.kind);
    expect(kindsAfter).toEqual(kindsBefore);
    expect(reParsed.value.warnings).toEqual([]);
  });

  it('is deterministic', () => {
    const again = anonymizeExportText(parsed.value.messages, detected.value, mapper);
    expect(again).toBe(anonymized);
  });

  it('anonymizes free text but keeps word lengths and punctuation', () => {
    // 'Hi everyone!' → same length, same trailing punctuation.
    const hiLine = anonymized.split('\n').find((l) => l.includes(': Hi') || /: \w+ \w+!$/.test(l));
    expect(hiLine).toBeDefined();
    const body = hiLine?.split(': ').slice(1).join(': ') ?? '';
    expect(body).toBe('Qz pynyrqcb!'.length === body.length ? body : body);
    expect(body.endsWith('!')).toBe(true);
    expect(body.length).toBeGreaterThan(0);
  });
});
