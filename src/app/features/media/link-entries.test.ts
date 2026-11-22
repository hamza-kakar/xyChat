import { describe, expect, it } from 'vitest';
import { asChatId } from '../../../core/ids';
import type { LinkMessageView } from '../../../client/db-client';
import { linkDomain, linkEntries } from './link-entries';

function message(rowId: number, body: string): LinkMessageView {
  return {
    messageRowId: rowId,
    seq: rowId,
    tsLocal: { year: 2026, month: 11, day: 17, hour: 9, minute: 0, second: 0 },
    authorName: 'Sara',
    chatId: asChatId('c1'),
    body,
  };
}

describe('linkDomain', () => {
  it('reads the host of web links and the address of mail links', () => {
    expect(linkDomain('https://www.example.com/a?b=1')).toBe('www.example.com');
    expect(linkDomain('mailto:someone@example.com')).toBe('someone@example.com');
    expect(linkDomain('tel:+923001234567')).toBe('+923001234567');
  });
});

describe('linkEntries', () => {
  it('lists each allowed link once per message, in order', () => {
    const entries = linkEntries([
      message(2, 'see https://b.example.org and https://a.example.com/x and https://b.example.org'),
      message(1, 'no links, javascript:alert(1) or ftp://x.example.com'),
      message(0, 'mail me@example.com'),
    ]);
    expect(entries.map((entry) => [entry.key, entry.domain])).toEqual([
      ['2-0', 'b.example.org'],
      ['2-1', 'a.example.com'],
      ['0-0', 'me@example.com'],
    ]);
    expect(entries[0]?.message.seq).toBe(2);
  });
});
