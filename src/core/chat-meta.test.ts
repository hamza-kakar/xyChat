import { describe, expect, it } from 'vitest';
import { isGroupChat, titleFromFileName } from './chat-meta';

describe('titleFromFileName', () => {
  it('parses iOS archive names', () => {
    expect(titleFromFileName('WhatsApp Chat - Family.zip')).toBe('Family');
    expect(titleFromFileName('WhatsApp Chat - Sara.txt')).toBe('Sara');
  });

  it('parses Android archive names', () => {
    expect(titleFromFileName('WhatsApp Chat with Sara.txt')).toBe('Sara');
  });

  it('falls back to the file name without extension', () => {
    expect(titleFromFileName('random.txt')).toBe('random');
    expect(titleFromFileName('no-extension')).toBe('no-extension');
  });
});

describe('isGroupChat', () => {
  it('is false for two authors without group events', () => {
    expect(isGroupChat(['Ali', 'Sara'], ['Messages and calls are end-to-end encrypted.'])).toBe(
      false,
    );
  });

  it('is true for more than two authors', () => {
    expect(isGroupChat(['Ali', 'Sara', 'Bob'], [])).toBe(true);
  });

  it('is true when a group-only event is seen', () => {
    expect(isGroupChat(['Ali', 'Sara'], ['Ali created group "Family"'])).toBe(true);
    expect(isGroupChat(['Ali', 'Sara'], ['Sara left'])).toBe(true);
    expect(isGroupChat(['Ali', 'Sara'], ['Ali changed the subject from "a" to "b"'])).toBe(true);
  });
});
