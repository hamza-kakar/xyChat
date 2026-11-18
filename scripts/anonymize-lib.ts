/**
 * Export anonymizer library (AGENTS.md §19.3). Turns a real export into a
 * safe fixture by rebuilding it from the PARSED representation: author names
 * map consistently to `Person A/B/…` (including mentions inside system
 * messages), free-text words become deterministic same-length pseudo-words
 * that preserve case and punctuation, digits, emoji, URLs (domain becomes
 * `example.com`), and the structural marker vocabulary stays intact so the
 * anonymized export still exercises every classification path.
 *
 * Deterministic: the same input always produces the same output.
 */
import type { DetectedFormat, ParsedMessage } from '../src/core/parser';

/** Author name → Person A/B/… mapping. */
export interface AuthorMapper {
  map(author: string): string;
}

/** Builds the consistent author mapper over all distinct authors. */
export function createAuthorMapper(authors: readonly string[]): AuthorMapper {
  const distinct = [...new Set(authors)];
  const byAuthor = new Map<string, string>();
  distinct.forEach((author, index) => {
    const letter = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[index % 26] ?? '?';
    byAuthor.set(author, `Person ${letter}`);
  });
  return {
    map(author: string): string {
      return byAuthor.get(author) ?? 'Person ?';
    },
  };
}

/** Structural vocabulary that is never anonymized. */
const MARKER_WORDS = new Set([
  'created',
  'group',
  'added',
  'removed',
  'left',
  'changed',
  'subject',
  'from',
  'to',
  'icon',
  'description',
  'joined',
  'turned',
  'on',
  'Disappearing',
  'messages',
  'message',
  'omitted',
  'attached',
  'file',
  'votes',
  'vote',
  'location',
  'POLL',
  'OPTION',
  'Media',
  'image',
  'video',
  'audio',
  'sticker',
  'GIF',
  'document',
  'Contact',
  'card',
  'This',
  'was',
  'You',
  'deleted',
  'edited',
  'Voice',
  'Video',
  'Missed',
  'call',
  'are',
  'and',
  'end-to-end',
  'encrypted',
  'Person',
  'Messages',
  'Tap',
  'learn',
  'more',
]);

/** Deterministic small non-negative integer from a string. */
function hash(text: string, max: number): number {
  let h = 0;
  for (let i = 0; i < text.length; i += 1) {
    h = (h * 31 + text.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % max;
}

const ALPHABET_LOWER = 'abcdefghijklmnopqrstuvwxyz';
const ALPHABET_UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** Same-length deterministic pseudo-word preserving per-character case. */
function pseudoWord(word: string): string {
  const step = hash(word, 13) + 1;
  let out = '';
  for (let i = 0; i < word.length; i += 1) {
    const code = word.charCodeAt(i);
    if (code >= 97 && code <= 122) {
      // a-z
      out += ALPHABET_LOWER[(code - 97 + step + i) % 26] ?? 'x';
    } else if (code >= 65 && code <= 90) {
      // A-Z
      out += ALPHABET_UPPER[(code - 65 + step + i) % 26] ?? 'X';
    } else {
      out += String.fromCharCode(code);
    }
  }
  return out;
}

/** Replaces every author mention in a segment with the Person name. */
function replaceAuthorMentions(
  segment: string,
  names: readonly string[],
  mapper: AuthorMapper,
): string {
  let out = segment;
  const sorted = [...names].sort((a, b) => b.length - a.length);
  for (const name of sorted) {
    out = out.split(name).join(mapper.map(name));
  }
  return out;
}

/** Media file-name-like tokens (kept verbatim: placeholder files share names). */
const FILE_NAME_RE =
  /\S+\.(?:jpg|jpeg|png|webp|gif|mp4|mov|3gp|opus|ogg|m4a|mp3|aac|wav|amr|vcf|pdf|docx?|xlsx?|pptx?|txt|zip)\b/giu;

/** Prefix of the boilerplate encrypted notice (contains no personal data). */
const ENCRYPTED_NOTICE_PREFIX = 'Messages and calls are end-to-end encrypted.';

/** Anonymizes free text: words pseudo-ized, structure and file names kept. */
function anonymizeText(text: string, names: readonly string[], mapper: AuthorMapper): string {
  // The encrypted notice is boilerplate; keep it verbatim (its vocabulary
  // spans hyphenated and multi-word tokens the word-splitter would mangle).
  if (text.startsWith(ENCRYPTED_NOTICE_PREFIX)) {
    return text;
  }
  const withAuthors = replaceAuthorMentions(text, names, mapper);
  // Carve out file-name-like tokens so their words are not pseudo-ized.
  const kept: string[] = [];
  const carved = withAuthors.replace(FILE_NAME_RE, (token) => {
    kept.push(token);
    return `\uE000${kept.length - 1}\uE001`;
  });
  let out = '';
  let word = '';
  const flush = (): void => {
    if (word === '') {
      return;
    }
    out += MARKER_WORDS.has(word) ? word : pseudoWord(word);
    word = '';
  };
  for (const char of carved) {
    if (/[A-Za-z]/u.test(char)) {
      word += char;
    } else {
      flush();
      out += char;
    }
  }
  flush();
  // Restore the kept file names.
  out = out.replace(/\uE000(\d+)\uE001/gu, (m, index) => kept[Number(index)] ?? m);
  return out;
}

/** Renders a wall-clock timestamp per the export's clock/seconds style. */
function renderTimestamp(
  message: ParsedMessage,
  format: DetectedFormat,
  dateOrder: 'DMY' | 'MDY',
): string {
  const t = message.timestamp;
  const day = dateOrder === 'DMY' ? t.day : t.month;
  const month = dateOrder === 'DMY' ? t.month : t.day;
  let time: string;
  if (format.clock === '24h') {
    const hh = String(t.hour).padStart(2, '0');
    const mm = String(t.minute).padStart(2, '0');
    time = format.hasSeconds ? `${hh}:${mm}:${String(t.second).padStart(2, '0')}` : `${hh}:${mm}`;
  } else {
    const h12 = t.hour % 12 === 0 ? 12 : t.hour % 12;
    const meridiem = t.hour >= 12 ? 'PM' : 'AM';
    const mm = String(t.minute).padStart(2, '0');
    time = format.hasSeconds
      ? `${h12}:${mm}:${String(t.second).padStart(2, '0')}\u202F${meridiem}`
      : `${h12}:${mm}\u202F${meridiem}`;
  }
  return `${day}/${month}/${t.year}, ${time}`;
}

/** Renders the omitted-media placeholder phrase for a media type. */
function omittedPhrase(mediaType: string): string {
  switch (mediaType) {
    case 'image':
      return 'image omitted';
    case 'video':
      return 'video omitted';
    case 'audio':
      return 'audio omitted';
    case 'sticker':
      return 'sticker omitted';
    case 'gif':
      return 'GIF omitted';
    case 'document':
      return 'document omitted';
    case 'contact-card':
      return 'Contact card omitted';
    default:
      return '<Media omitted>';
  }
}

/** Renders one parsed message back into export lines (deterministic). */
function renderMessageLines(
  message: ParsedMessage,
  format: DetectedFormat,
  names: readonly string[],
  mapper: AuthorMapper,
): readonly string[] {
  const ts = renderTimestamp(message, format, 'DMY');
  const authorPrefix = message.author === null ? '' : `${mapper.map(message.author)}: `;
  const header = format.platform === 'ios' ? `[${ts}] ${authorPrefix}` : `${ts} - ${authorPrefix}`;

  const lines: string[] = [];
  const emit = (firstLine: string, continuation: readonly string[] = []): void => {
    lines.push(`${header}${anonymizeText(firstLine, names, mapper)}`);
    for (const line of continuation) {
      lines.push(anonymizeText(line, names, mapper));
    }
  };

  switch (message.kind) {
    case 'media': {
      const attachment = message.attachment;
      if (attachment !== null && attachment.status === 'omitted') {
        emit(omittedPhrase(attachment.mediaType), message.body === '' ? [] : [message.body]);
      } else if (attachment !== null && attachment.fileName !== null) {
        if (format.platform === 'ios') {
          emit(`<attached: ${attachment.fileName}>`, message.body === '' ? [] : [message.body]);
        } else {
          emit(`${attachment.fileName} (file attached)`, message.body === '' ? [] : [message.body]);
        }
      } else {
        emit(message.body);
      }
      break;
    }
    case 'contact': {
      const fileName = message.attachment?.fileName ?? 'contact.vcf';
      if (format.platform === 'ios') {
        emit(`<attached: ${fileName}>`);
      } else {
        emit(`${fileName} (file attached)`);
      }
      break;
    }
    case 'poll': {
      const poll = message.poll;
      const optionLines = (poll?.options ?? []).map(
        (o) =>
          `OPTION: ${anonymizeText(o.text, names, mapper)} (${o.votes ?? 0} ${o.votes === 1 ? 'vote' : 'votes'})`,
      );
      emit('POLL:', [poll?.question ?? '', ...optionLines]);
      break;
    }
    case 'location': {
      const loc = message.location;
      emit(loc === null ? 'location:' : `location: ${loc.url}`);
      break;
    }
    case 'call':
    case 'deleted':
    case 'system':
    case 'text': {
      emit(message.body);
      break;
    }
  }
  return lines;
}

/**
 * Renders the full anonymized export text from parsed messages.
 *
 * @param messages Parsed messages in file order.
 * @param format Detected format (platform/clock/seconds drive the style).
 * @param mapper The consistent author mapper.
 * @example
 * const mapper = createAuthorMapper(parsed.participants);
 * writeFileSync('out.txt', anonymizeExportText(parsed.messages, format, mapper));
 */
export function anonymizeExportText(
  messages: readonly ParsedMessage[],
  format: DetectedFormat,
  mapper: AuthorMapper,
): string {
  const names = [...new Set(messages.map((m) => m.author).filter((a): a is string => a !== null))];
  const lines: string[] = [];
  for (const message of messages) {
    lines.push(...renderMessageLines(message, format, names, mapper));
  }
  return lines.join('\n');
}

/** Collects the distinct author names of a parsed export. */
export function collectAuthors(messages: readonly ParsedMessage[]): readonly string[] {
  return [...new Set(messages.map((m) => m.author).filter((a): a is string => a !== null))];
}

/** Actor patterns inside system bodies: `X created group…`, `X added Y`, … */
const ACTOR_PATTERNS: readonly RegExp[] = [
  /^(?:\u200E)?(.+?) (?:created group|added|removed|left|changed|joined|turned on) /u,
];

/** Extracts the leading actor phrase of a system body (whole, not split). */
function actorCandidates(body: string): readonly string[] {
  const out: string[] = [];
  for (const re of ACTOR_PATTERNS) {
    const m = re.exec(body);
    if (m?.[1] !== undefined && m[1].trim() !== '') {
      out.push(m[1].trim());
    }
  }
  return out;
}

/**
 * Collects every known person name: message authors plus actors named in
 * system events, so mentions map to Person names consistently.
 */
export function collectAllNames(messages: readonly ParsedMessage[]): readonly string[] {
  const names = [...collectAuthors(messages)];
  for (const message of messages) {
    if (message.kind === 'system') {
      names.push(...actorCandidates(message.body));
    }
  }
  return [...new Set(names.filter((n) => n.trim() !== ''))];
}
