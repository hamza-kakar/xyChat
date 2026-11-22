/**
 * Row validation tests (AGENTS.md §18.5, §10.5): poll/location extras,
 * invalid rows, and the error-message shape.
 */
import { describe, expect, it } from 'vitest';
import { messageFromRow } from '../../src/storage/sqlite/rows';

const BASE_ROW: Record<string, unknown> = {
  id: 1,
  chat_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  fingerprint: 'fp-1',
  seq: 0,
  ts_local: '2026-11-17T21:19:03',
  ts_key: 1792346343,
  author_id: null,
  author_name: null,
  kind: 'text',
  body: 'plain',
  is_edited: 0,
  extra_json: null,
  import_id: 'imp-1',
};

describe('messageFromRow', () => {
  it('parses a poll message from extra_json', () => {
    const row = {
      ...BASE_ROW,
      kind: 'poll',
      extra_json: JSON.stringify({
        question: 'Dinner?',
        options: [{ text: 'Biryani', votes: 2 }],
      }),
    };
    const message = messageFromRow(row);
    expect(message.poll).toEqual({
      question: 'Dinner?',
      options: [{ text: 'Biryani', votes: 2 }],
    });
    expect(message.location).toBeNull();
  });

  it('parses a location message from extra_json', () => {
    const row = {
      ...BASE_ROW,
      kind: 'location',
      extra_json: JSON.stringify({ lat: 24.86, lng: 67.0, url: 'https://maps.example' }),
    };
    const message = messageFromRow(row);
    expect(message.location).toEqual({ lat: 24.86, lng: 67.0, url: 'https://maps.example' });
    expect(message.poll).toBeNull();
  });

  it('rejects invalid extra_json payloads for poll messages', () => {
    const row = { ...BASE_ROW, kind: 'poll', extra_json: 'not json' };
    expect(() => messageFromRow(row)).toThrow();
  });

  it('rejects rows missing required columns with a descriptive error', () => {
    expect(() => messageFromRow({ id: 9 })).toThrow(/invalid messages row/);
  });
});
