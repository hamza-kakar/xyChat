import { describe, expect, it } from 'vitest';
import { en } from './locale/en';
import { classifyBody } from './classify';

/** Classifies an iOS-style REST with the English table. */
function ios(rest: string, continuation: readonly string[] = []) {
  return classifyBody(rest, continuation, en, 'ios');
}

/** Classifies an Android-style REST with the English table. */
function android(rest: string, continuation: readonly string[] = []) {
  return classifyBody(rest, continuation, en, 'android');
}

describe('system messages', () => {
  it('classifies the encrypted notice as system before any author split', () => {
    const r = android(
      'Messages and calls are end-to-end encrypted. No one outside of this chat can read them.',
    );
    expect(r).toMatchObject({ author: null, kind: 'system' });
  });

  it('classifies group events containing ": " as system', () => {
    const r = android('Ali Khan changed the subject from "Fam: old" to "Family"');
    expect(r.kind).toBe('system');
    expect(r.author).toBeNull();
  });

  it('classifies the iOS group-author system form', () => {
    const r = ios('Family Group: \u200EMessages and calls are end-to-end encrypted.');
    expect(r.author).toBeNull();
    expect(r.kind).toBe('system');
    expect(r.body).not.toContain('\u200E');
  });

  it('classifies created-group events', () => {
    expect(android('Ali Khan created group "Family"').kind).toBe('system');
    expect(android('Ali Khan added Sara').kind).toBe('system');
    expect(android('Sara left').kind).toBe('system');
  });

  it('treats an unknown no-colon body as system', () => {
    const r = android('some unclassifiable event');
    expect(r.kind).toBe('system');
    expect(r.author).toBeNull();
    expect(r.body).toBe('some unclassifiable event');
  });
});

describe('text messages', () => {
  it('splits at the first colon-space', () => {
    const r = ios('Ali Khan: note at 10:00');
    expect(r.author).toBe('Ali Khan');
    expect(r.kind).toBe('text');
    expect(r.body).toBe('note at 10:00');
  });

  it('keeps continuation lines in the body', () => {
    const r = ios('Sara: line one', ['line two', '', 'line four']);
    expect(r.body).toBe('line one\nline two\n\nline four');
  });

  it('handles phone-number authors', () => {
    const r = android('+92 300 1234567: pinger');
    expect(r.author).toBe('+92 300 1234567');
    expect(r.body).toBe('pinger');
  });

  it('strips a leading RLM from authors', () => {
    const r = ios('\u200FAuthor: text');
    expect(r.author).toBe('Author');
    expect(r.body).toBe('text');
  });

  it('classifies iOS vcf attachments as contact messages', () => {
    const r = ios('Ali Khan: \u200E<attached: contact.vcf>');
    expect(r.kind).toBe('contact');
    expect(r.attachment?.mediaType).toBe('contact-card');
  });

  it('preserves emoji-only bodies exactly', () => {
    const r = ios('Sara: \u{1F600}\u{1F600}');
    expect(r.body).toBe('\u{1F600}\u{1F600}');
  });
});

describe('edited and deleted', () => {
  it('strips the edited marker and sets the flag', () => {
    const r = ios('Ali Khan: See you soon \u200E<This message was edited>');
    expect(r.isEdited).toBe(true);
    expect(r.body).toBe('See you soon');
    expect(r.kind).toBe('text');
  });

  it('classifies deleted messages', () => {
    const r = ios('Sara: \u200EThis message was deleted.');
    expect(r.kind).toBe('deleted');
    expect(r.body).toBe('This message was deleted.');
    expect(r.author).toBe('Sara');
  });

  it('classifies self-deleted messages', () => {
    const r = android('Ali Khan: You deleted this message');
    expect(r.kind).toBe('deleted');
  });
});

describe('attachments', () => {
  it('parses iOS inline attachment markers with captions', () => {
    const r = ios('Sara: \u200E<attached: 00000012-PHOTO-2026-11-17-21-20-01.jpg>', [
      'sunset at the beach',
    ]);
    expect(r.kind).toBe('media');
    expect(r.attachment).toEqual({
      fileName: '00000012-PHOTO-2026-11-17-21-20-01.jpg',
      mediaType: 'image',
      status: 'referenced',
    });
    expect(r.body).toBe('sunset at the beach');
  });

  it('parses Android file-attached markers', () => {
    const r = android('Ali Khan: IMG-20261117-WA0001.jpg (file attached)', ['Caption here']);
    expect(r.kind).toBe('media');
    expect(r.attachment?.fileName).toBe('IMG-20261117-WA0001.jpg');
    expect(r.body).toBe('Caption here');
  });

  it('parses iOS attachment markers with no caption', () => {
    const r = ios('Sara: \u200E<attached: 00000012-PHOTO-2026-11-17-21-20-01.jpg>');
    expect(r.kind).toBe('media');
    expect(r.body).toBe('');
    expect(r.attachment?.fileName).toBe('00000012-PHOTO-2026-11-17-21-20-01.jpg');
  });

  it('classifies omitted placeholders with inferred types', () => {
    expect(ios('Ali Khan: \u200Eimage omitted')).toMatchObject({
      kind: 'media',
      attachment: { fileName: null, mediaType: 'image', status: 'omitted' },
    });
    expect(android('Sara: <Media omitted>')).toMatchObject({
      kind: 'media',
      attachment: { mediaType: 'other', status: 'omitted' },
    });
    expect(android('Sara: document omitted')).toMatchObject({
      kind: 'media',
      attachment: { mediaType: 'document', status: 'omitted' },
    });
  });

  it('classifies vcf attachments as contact messages', () => {
    const r = android('Ali Khan: contact.vcf (file attached)');
    expect(r.kind).toBe('contact');
    expect(r.attachment?.mediaType).toBe('contact-card');
  });
});

describe('locations', () => {
  it('parses maps URLs with coordinates', () => {
    const r = android('Sara: location: https://maps.google.com/?q=24.8607,67.0011');
    expect(r.kind).toBe('location');
    expect(r.location).toEqual({
      lat: 24.8607,
      lng: 67.0011,
      url: 'https://maps.google.com/?q=24.8607,67.0011',
    });
  });

  it('falls back to text when coordinates are unparseable', () => {
    const r = android('Sara: location: somewhere nice');
    expect(r.kind).toBe('text');
    expect(r.body).toBe('location: somewhere nice');
  });
});

describe('polls', () => {
  it('keeps ordinary messages containing system keywords as text with authors', () => {
    // Regression: system actor patterns used `.+` and crossed the ": "
    // separator, turning these into author-less system messages.
    expect(android('Sara: I added sugar to the tea')).toEqual(
      expect.objectContaining({ author: 'Sara', kind: 'text', body: 'I added sugar to the tea' }),
    );
    expect(android('Ali Khan: ok we left')).toEqual(
      expect.objectContaining({ author: 'Ali Khan', kind: 'text' }),
    );
    expect(android('Sara: Bob removed the stain')).toEqual(
      expect.objectContaining({ author: 'Sara', kind: 'text' }),
    );
    expect(ios('Ali Khan: Disappearing messages are cool')).toEqual(
      expect.objectContaining({ author: 'Ali Khan', kind: 'text' }),
    );
    expect(android('Sara: I joined the group yesterday')).toEqual(
      expect.objectContaining({ author: 'Sara', kind: 'text' }),
    );
  });

  it('still classifies real system events after the pattern tightening', () => {
    expect(android('Ali Khan created group "Family"').kind).toBe('system');
    expect(android('Ali Khan added Sara').kind).toBe('system');
    expect(android('Sara left').kind).toBe('system');
    expect(android('Ali Khan changed the subject from "Fam: old" to "Family"').kind).toBe('system');
  });

  it('keeps continuation lines after call markers', () => {
    const r = ios('Sara: \u200EMissed voice call', ['second line after call']);
    expect(r.kind).toBe('call');
    expect(r.body).toBe('Missed voice call\nsecond line after call');
  });

  it('keeps continuation lines after deleted markers', () => {
    const r = ios('Sara: \u200EThis message was deleted.', ['stray continuation']);
    expect(r.kind).toBe('deleted');
    expect(r.body).toBe('This message was deleted.\nstray continuation');
  });

  it('parses poll question and options', () => {
    const r = android('Ali Khan: POLL:', [
      'Dinner?',
      'OPTION: Biryani (2 votes)',
      'OPTION: Karahi (1 vote)',
    ]);
    expect(r.kind).toBe('poll');
    expect(r.poll).toEqual({
      question: 'Dinner?',
      options: [
        { text: 'Biryani', votes: 2 },
        { text: 'Karahi', votes: 1 },
      ],
    });
  });

  it('falls back to text when a poll line is not an OPTION', () => {
    const r = android('Ali Khan: POLL:', ['Dinner?', 'not an option line']);
    expect(r.kind).toBe('text');
  });

  it('falls back to text for a bare POLL: with no options', () => {
    const r = android('Ali Khan: POLL:');
    expect(r.kind).toBe('text');
    expect(r.body).toBe('POLL:');
  });

  it('falls back to text for malformed polls', () => {
    const r = android('Ali Khan: POLL:', ['Dinner?']);
    expect(r.kind).toBe('text');
  });
});

describe('calls', () => {
  it('classifies call bodies', () => {
    expect(ios('Sara: \u200EVoice call').kind).toBe('call');
    expect(ios('Sara: Missed video call').kind).toBe('call');
    expect(ios('Sara: regular text').kind).toBe('text');
  });
});
