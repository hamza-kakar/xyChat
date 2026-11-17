import { describe, expect, it } from 'vitest';
import { detectFormat, parseChat, parseChatIterator, PARSER_VERSION } from './index';

const IOS_TEXT = [
  '[17/11/2026, 9:19:03 PM] Ali Khan: Hello there',
  'second line of the same message',
  '[17/11/2026, 9:20:00 PM] Sara: \u200E<attached: 00000012-PHOTO-2026-11-17-21-20-01.jpg>',
  '[17/11/2026, 9:21:00 PM] Sara: \u200EThis message was deleted.',
].join('\n');

describe('parseChat (public API)', () => {
  it('round-trips a small iOS export end to end', () => {
    const detected = detectFormat(IOS_TEXT);
    if (!detected.ok) {
      throw new Error('detection failed');
    }
    const parsed = parseChat(IOS_TEXT, { format: detected.value });
    if (!parsed.ok) {
      throw new Error('parse failed');
    }
    const { value } = parsed;
    expect(value.messages).toHaveLength(3);
    expect(value.messages[0]).toMatchObject({
      seq: 0,
      author: 'Ali Khan',
      body: 'Hello there\nsecond line of the same message',
    });
    expect(value.messages[1]).toMatchObject({
      author: 'Sara',
      kind: 'media',
      attachment: { fileName: '00000012-PHOTO-2026-11-17-21-20-01.jpg', status: 'referenced' },
    });
    expect(value.messages[2]).toMatchObject({ kind: 'deleted' });
    expect(value.participants).toEqual(['Ali Khan', 'Sara']);
    expect(value.parserVersion).toBe(PARSER_VERSION);
    expect(value.format).toBe(detected.value);
    expect(value.stats).toEqual({ lines: 4, messages: 3, system: 0, media: 1 });
  });

  it('falls back to the bundled locale when the locales array is empty', () => {
    const detected = detectFormat(IOS_TEXT);
    if (!detected.ok) {
      throw new Error('detection failed');
    }
    const parsed = parseChat(IOS_TEXT, { format: detected.value, locales: [] });
    if (!parsed.ok) {
      throw new Error('parse failed');
    }
    expect(parsed.value.messages).toHaveLength(3);
  });

  it('honors a user-overridden date order (§12.8)', () => {
    const ambiguous = ['[03/04/2026, 9:19 AM] A: a', '[03/05/2026, 9:20 AM] B: b'].join('\n');
    const detected = detectFormat(ambiguous);
    if (!detected.ok) {
      throw new Error('detection failed');
    }
    const overridden = {
      ...detected.value,
      dateOrder: 'MDY' as const,
      dateOrderSource: 'user' as const,
    };
    const parsed = parseChat(ambiguous, { format: overridden });
    if (!parsed.ok) {
      throw new Error('parse failed');
    }
    expect(parsed.value.messages[0]?.timestamp).toEqual({
      year: 2026,
      month: 3,
      day: 4,
      hour: 9,
      minute: 19,
      second: 0,
    });
  });
});

describe('parseChatIterator (public API)', () => {
  it('yields message events and returns the summary', () => {
    const detected = detectFormat(IOS_TEXT);
    if (!detected.ok) {
      throw new Error('detection failed');
    }
    const iterator = parseChatIterator(IOS_TEXT, { format: detected.value });
    const events = [];
    let stepped = iterator.next();
    while (stepped.done !== true) {
      events.push(stepped.value);
      stepped = iterator.next();
    }
    const messageEvents = events.filter((e) => e.type === 'message');
    expect(messageEvents).toHaveLength(3);
    expect(stepped.value.messages).toHaveLength(3);
    expect(stepped.value.participants).toEqual(['Ali Khan', 'Sara']);
  });
});
