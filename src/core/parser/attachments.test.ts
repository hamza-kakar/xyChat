import { describe, expect, it } from 'vitest';
import { mediaTypeForFileName, mimeForFileName } from './attachments';

describe('mediaTypeForFileName', () => {
  it('classifies iOS infix names', () => {
    expect(mediaTypeForFileName('00000012-PHOTO-2026-11-17-21-19-03.jpg')).toBe('image');
    expect(mediaTypeForFileName('00000013-VIDEO-2026-11-17-21-20-01.mp4')).toBe('video');
    expect(mediaTypeForFileName('00000014-AUDIO-2026-11-17-21-21-00.m4a')).toBe('voice');
    expect(mediaTypeForFileName('00000015-STICKER-2026-11-17-21-22-00.webp')).toBe('sticker');
  });

  it('classifies Android prefix names', () => {
    expect(mediaTypeForFileName('IMG-20261117-WA0001.jpg')).toBe('image');
    expect(mediaTypeForFileName('VID-20261117-WA0002.mp4')).toBe('video');
    expect(mediaTypeForFileName('PTT-20261117-WA0003.opus')).toBe('voice');
    expect(mediaTypeForFileName('AUD-20261117-WA0004.m4a')).toBe('audio');
    expect(mediaTypeForFileName('STK-20261117-WA0005.webp')).toBe('sticker');
    expect(mediaTypeForFileName('DOC-20261117-WA0006.pdf')).toBe('document');
  });

  it('falls back to the extension', () => {
    expect(mediaTypeForFileName('notes.txt')).toBe('document');
    expect(mediaTypeForFileName('contact.vcf')).toBe('contact-card');
    expect(mediaTypeForFileName('song.mp3')).toBe('audio');
    expect(mediaTypeForFileName('clip.mov')).toBe('video');
  });

  it('returns other for unknown names', () => {
    expect(mediaTypeForFileName('mystery.xyz')).toBe('other');
  });
});

describe('mimeForFileName', () => {
  it('maps known extensions', () => {
    expect(mimeForFileName('a.jpg')).toBe('image/jpeg');
    expect(mimeForFileName('a.mp4')).toBe('video/mp4');
    expect(mimeForFileName('a.opus')).toBe('audio/ogg');
    expect(mimeForFileName('a.vcf')).toBe('text/vcard');
    expect(mimeForFileName('a.pdf')).toBe('application/pdf');
  });

  it('falls back to octet-stream', () => {
    expect(mimeForFileName('a.xyz')).toBe('application/octet-stream');
  });
});
