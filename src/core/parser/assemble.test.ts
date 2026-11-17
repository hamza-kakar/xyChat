import { describe, expect, it } from 'vitest';
import { drainToSummary, assembleMessages, resolveTimestamp } from './assemble';
import { en } from './locale/en';
import type { AssemblyFormat } from './assemble';
import type { RawHeaderMatch } from './header-patterns';

const IOS_DMY: AssemblyFormat = {
  headerPatternId: 'ios-bracket',
  dateOrder: 'DMY',
  clock: '12h',
  platform: 'ios',
};

const ANDROID_DMY: AssemblyFormat = {
  headerPatternId: 'android-dash',
  dateOrder: 'DMY',
  clock: '24h',
  platform: 'android',
};

/** Assembles with defaults and returns the summary. */
function assemble(text: string, format: AssemblyFormat = IOS_DMY) {
  return drainToSummary(assembleMessages(text, format, en));
}

const HEADER = (rest: string, day = 17, hour = 21, minute = 19): string => {
  const meridiem = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `[${day}/11/2026, ${hour12}:${minute === 0 ? '00' : minute}:00\u202F${meridiem}] ${rest}`;
};

describe('assembleMessages', () => {
  it('parses messages with seq, sourceLine and timestamps', () => {
    const text = [HEADER('Ali Khan: Hello there'), HEADER('Sara: hi', 17, 21, 20)].join('\n');
    const s = assemble(text);
    expect(s.messages).toHaveLength(2);
    expect(s.messages[0]).toMatchObject({
      seq: 0,
      sourceLine: 1,
      author: 'Ali Khan',
      kind: 'text',
      body: 'Hello there',
    });
    expect(s.messages[1]).toMatchObject({ seq: 1, sourceLine: 2, author: 'Sara' });
    expect(s.messages[1]?.timestamp).toEqual({
      year: 2026,
      month: 11,
      day: 17,
      hour: 21,
      minute: 20,
      second: 0,
    });
  });

  it('strips BOM and handles CRLF input', () => {
    const text = `\uFEFF${HEADER('A: one')}\r\n${HEADER('B: two', 17, 21, 20)}\r\n`;
    const s = assemble(text);
    expect(s.stats.messages).toBe(2);
    expect(s.stats.lines).toBe(3);
  });

  it('treats non-header lines as continuations', () => {
    const text = [
      HEADER('A: line one'),
      'line two',
      '',
      'line four',
      HEADER('B: next', 17, 21, 20),
    ].join('\n');
    const s = assemble(text);
    expect(s.messages[0]?.body).toBe('line one\nline two\n\nline four');
    expect(s.messages).toHaveLength(2);
  });

  it('warns once for orphan lines before the first message', () => {
    const text = ['stray line', 'another stray', HEADER('A: real')].join('\n');
    const s = assemble(text);
    const orphans = s.warnings.filter((w) => w.code === 'ORPHAN_LINES_BEFORE_FIRST_MESSAGE');
    expect(orphans).toHaveLength(1);
    expect(orphans[0]?.detail).toContain('2');
    expect(s.messages).toHaveLength(1);
  });

  it('counts participants in first-seen order', () => {
    const text = [HEADER('B: b1'), HEADER('A: a1', 17, 21, 20), HEADER('B: b2', 17, 21, 21)].join(
      '\n',
    );
    expect(assemble(text).participants).toEqual(['B', 'A']);
  });
});

describe('assembleMessages warnings', () => {
  it('warns on invalid dates and keeps the line as a continuation', () => {
    const text = [
      HEADER('A: real'),
      '[32/13/2026, 9:00 PM] not a header',
      HEADER('B: next', 17, 21, 20),
    ].join('\n');
    const s = assemble(text);
    const invalid = s.warnings.filter((w) => w.code === 'INVALID_DATE');
    expect(invalid).toHaveLength(1);
    expect(s.messages).toHaveLength(2);
    expect(s.messages[0]?.body).toContain('not a header');
  });

  it('warns on out-of-order timestamps at most once per 1000 lines', () => {
    const lines: string[] = [HEADER('A: first', 17, 21, 30)];
    // 1000 filler messages to separate warnings.
    for (let i = 0; i < 1000; i += 1) {
      lines.push(HEADER(`A: filler ${i}`, 17, 21, 40));
    }
    lines.push(HEADER('A: earlier than first', 17, 21, 10));
    const s = assemble(lines.join('\n'));
    const outOfOrder = s.warnings.filter((w) => w.code === 'OUT_OF_ORDER_TIMESTAMP');
    expect(outOfOrder).toHaveLength(1);
  });
});

describe('assembleMessages streaming and sampling', () => {
  it('warns for orphans when the file has no messages at all', () => {
    const s = assemble(['stray one', 'stray two'].join('\n'));
    expect(s.messages).toHaveLength(0);
    const orphans = s.warnings.filter((w) => w.code === 'ORPHAN_LINES_BEFORE_FIRST_MESSAGE');
    expect(orphans).toHaveLength(1);
    expect(orphans[0]?.line).toBe(1);
  });

  it('emits progress events every 5000 lines', () => {
    const lines: string[] = [];
    for (let i = 0; i < 5001; i += 1) {
      lines.push(HEADER(`A: m${i}`, 17, 21, i % 60));
    }
    const events = [...assembleMessages(lines.join('\n'), IOS_DMY, en)];
    const progress = events.filter((e) => e.type === 'progress');
    expect(progress.length).toBeGreaterThanOrEqual(1);
    expect(progress[0]).toEqual({ type: 'progress', linesProcessed: 5000, totalLines: 5001 });
  });

  it('stops at maxMessages for preview samples', () => {
    const lines: string[] = [];
    for (let i = 0; i < 50; i += 1) {
      lines.push(HEADER(`A: m${i}`, 17, 21, i % 60));
    }
    const s = drainToSummary(assembleMessages(lines.join('\n'), IOS_DMY, en, { maxMessages: 20 }));
    expect(s.messages).toHaveLength(20);
    expect(s.stats.messages).toBe(20);
  });

  it('tracks system and media counts in stats', () => {
    const text = [
      '17/11/2026, 21:19 - Messages and calls are end-to-end encrypted.',
      '17/11/2026, 21:20 - Ali Khan: IMG-20261117-WA0001.jpg (file attached)',
      '17/11/2026, 21:21 - Sara: plain text',
      '17/11/2026, 21:22 - Sara: <Media omitted>',
    ].join('\n');
    const s = assemble(text, ANDROID_DMY);
    expect(s.stats).toEqual({ lines: 4, messages: 4, system: 1, media: 2 });
  });
});

describe('resolveTimestamp', () => {
  const base: RawHeaderMatch = {
    patternId: 'ios-bracket',
    date: ['17', '11', '2026'],
    dateSeparator: '/',
    hour: '9',
    minute: '19',
    second: '03',
    meridiem: 'pm',
    rest: 'x',
  };

  it('converts 12h meridiems (12 PM → 12, 12 AM → 0, 1 PM → 13)', () => {
    expect(resolveTimestamp({ ...base, hour: '12', meridiem: 'pm' }, 'DMY')).toMatchObject({
      ok: true,
      value: { hour: 12 },
    });
    expect(resolveTimestamp({ ...base, hour: '12', meridiem: 'am' }, 'DMY')).toMatchObject({
      value: { hour: 0 },
    });
    expect(resolveTimestamp({ ...base, hour: '1', meridiem: 'pm' }, 'DMY')).toMatchObject({
      value: { hour: 13 },
    });
  });

  it('maps two-digit years to 2000+yy', () => {
    expect(resolveTimestamp({ ...base, date: ['17', '11', '26'] }, 'DMY')).toMatchObject({
      value: { year: 2026 },
    });
  });

  it('applies the date order', () => {
    expect(resolveTimestamp({ ...base, date: ['11', '17', '26'] }, 'MDY')).toMatchObject({
      value: { month: 11, day: 17 },
    });
    expect(resolveTimestamp({ ...base, date: ['2026', '11', '17'] }, 'YMD')).toMatchObject({
      value: { year: 2026, month: 11, day: 17 },
    });
  });

  it('rejects invalid dates and times', () => {
    expect(resolveTimestamp({ ...base, date: ['17', '13', '2026'] }, 'DMY')).toEqual({
      ok: false,
      error: 'INVALID_DATE',
    });
    expect(resolveTimestamp({ ...base, hour: '25', meridiem: null }, 'DMY')).toEqual({
      ok: false,
      error: 'INVALID_TIME',
    });
  });
});
