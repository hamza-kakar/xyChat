/**
 * Synthetic export fixture generator (AGENTS.md §19.2). Each variant is a
 * typed description of an export shape; running this script renders the
 * input text, runs the real parser, and writes
 * `tests/fixtures/whatsapp/<variant>/{chat.txt, expected.json, README.md}`.
 *
 * `expected.json` is committed and reviewed; it is NEVER regenerated in CI.
 * Run `pnpm fixtures:gen` to (re)create files; `pnpm fixtures:update` to
 * refresh expected outputs deliberately, and call the diff out in the PR.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectFormat, parseChat, PARSER_VERSION, type DetectedFormat } from '../src/core/parser';
import type { ClockFormat, DateOrder, SourcePlatform } from '../src/core/model';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixturesRoot = resolve(projectRoot, 'tests/fixtures/whatsapp');

/** Locale hint for detection, where the variant needs one. */
interface VariantSpec {
  readonly id: string;
  readonly description: string;
  readonly lines: readonly string[];
  /** Line endings and BOM are applied at render time (default LF, no BOM). */
  readonly crlf?: boolean;
  readonly bom?: boolean;
  readonly localeHint?: string;
  readonly expectedPlatform: SourcePlatform;
  readonly expectedPatternId: DetectedFormat['headerPatternId'];
  readonly expectedOrder: DateOrder;
  readonly expectedOrderSource: DetectedFormat['dateOrderSource'];
  readonly expectedClock: ClockFormat;
  readonly expectedSeconds: boolean;
}

/* ---------- per-variant line builders ---------- */

/** iOS DMY 12h header with seconds (narrow nbsp inserted by default). */
const ios = (
  day: number,
  h12: number,
  m: number,
  s: number,
  meridiem: 'AM' | 'PM',
  rest: string,
): string =>
  `[${day}/11/2026, ${h12}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}\u202F${meridiem}] ${rest}`;

/** Android DMY 24h header. */
const android = (day: number, h: number, m: number, rest: string): string =>
  `${day}/11/2026, ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')} - ${rest}`;

/** The canonical WhatsApp encrypted notice (Android form). */
const ENCRYPTED =
  'Messages and calls are end-to-end encrypted. No one outside of this chat, not even WhatsApp, can read or listen to them.';

const VARIANTS: readonly VariantSpec[] = [
  {
    id: 'ios-dmy-12h-seconds-group',
    description: 'iOS export, DMY dates, 12h clock with seconds, group chat with system events.',
    lines: [
      ios(17, 9, 19, 3, 'PM', 'Ali Khan: Hello there'),
      ios(17, 9, 19, 30, 'PM', 'Sara: line one\nline two of the same message'),
      ios(
        17,
        9,
        20,
        1,
        'PM',
        'Family Group: \u200EMessages and calls are end-to-end encrypted. No one outside of this chat, not even WhatsApp, can read or listen to them.',
      ),
      ios(17, 9, 21, 0, 'PM', 'Ali Khan: \u200Eimage omitted'),
    ],
    expectedPlatform: 'ios',
    expectedPatternId: 'ios-bracket',
    expectedOrder: 'DMY',
    expectedOrderSource: 'unambiguous',
    expectedClock: '12h',
    expectedSeconds: true,
  },
  {
    id: 'ios-mdy-12h-seconds-1to1',
    description: 'iOS export, MDY dates (second component > 12), 1:1 chat.',
    lines: ['[11/17/2026, 9:19:03 PM] Bob: a', '[11/18/2026, 8:00:00 AM] Bob: b'],
    expectedPlatform: 'ios',
    expectedPatternId: 'ios-bracket',
    expectedOrder: 'MDY',
    expectedOrderSource: 'unambiguous',
    expectedClock: '12h',
    expectedSeconds: true,
  },
  {
    id: 'ios-dmy-24h-seconds',
    description: 'iOS export with 24h clock and seconds.',
    lines: ['[17/11/2026, 21:19:03] Ali Khan: hi 24h', '[17/11/2026, 21:20:00] Sara: hello back'],
    expectedPlatform: 'ios',
    expectedPatternId: 'ios-bracket',
    expectedOrder: 'DMY',
    expectedOrderSource: 'unambiguous',
    expectedClock: '24h',
    expectedSeconds: true,
  },
  {
    id: 'ios-dot-dates-24h',
    description: 'iOS export with dot-separated dates and a trailing year dot.',
    lines: ['[17.11.26., 21:19] Anna: dotted date', '[18.11.26., 09:00:30] Anna: another dotted'],
    expectedPlatform: 'ios',
    expectedPatternId: 'ios-bracket',
    expectedOrder: 'DMY',
    expectedOrderSource: 'unambiguous',
    expectedClock: '24h',
    expectedSeconds: true,
  },
  {
    id: 'ios-narrow-nbsp-meridiem',
    description: 'iOS export where the meridiem is preceded by U+202F.',
    lines: [
      '[17/11/2026, 9:19:03\u202FPM] Ali Khan: narrow space before PM',
      '[17/11/2026, 8:00:00\u202FAM] Sara: morning',
    ],
    expectedPlatform: 'ios',
    expectedPatternId: 'ios-bracket',
    expectedOrder: 'DMY',
    expectedOrderSource: 'unambiguous',
    expectedClock: '12h',
    expectedSeconds: true,
  },
  {
    id: 'ios-lrm-attachments',
    description: 'iOS export with LRM-prefixed attachment markers and captions.',
    lines: [
      ios(17, 9, 20, 1, 'PM', 'Sara: \u200E<attached: 00000012-PHOTO-2026-11-17-21-20-01.jpg>'),
      'sunset at the beach',
      ios(17, 9, 21, 0, 'PM', 'Ali Khan: \u200E<attached: 00000013-VIDEO-2026-11-17-21-21-00.mp4>'),
    ],
    expectedPlatform: 'ios',
    expectedPatternId: 'ios-bracket',
    expectedOrder: 'DMY',
    expectedOrderSource: 'unambiguous',
    expectedClock: '12h',
    expectedSeconds: true,
  },
  {
    id: 'ios-system-as-group-author',
    description: 'iOS export where system events are written under the group name.',
    lines: [
      ios(17, 9, 19, 0, 'PM', 'Family Group: \u200EAli Khan added Sara'),
      ios(17, 9, 19, 30, 'PM', 'Sara: thanks for adding me'),
    ],
    expectedPlatform: 'ios',
    expectedPatternId: 'ios-bracket',
    expectedOrder: 'DMY',
    expectedOrderSource: 'unambiguous',
    expectedClock: '12h',
    expectedSeconds: true,
  },
  {
    id: 'ios-without-media-omitted',
    description: 'iOS export made without media: omitted placeholders of several kinds.',
    lines: [
      ios(17, 9, 19, 0, 'PM', 'Ali Khan: \u200Eimage omitted'),
      ios(17, 9, 19, 30, 'PM', 'Sara: \u200Evideo omitted'),
      ios(17, 9, 20, 0, 'PM', 'Sara: \u200Eaudio omitted'),
      ios(17, 9, 20, 30, 'PM', 'Sara: \u200Esticker omitted'),
      ios(17, 9, 21, 0, 'PM', 'Ali Khan: \u200EGIF omitted'),
      ios(17, 9, 21, 30, 'PM', 'Sara: \u200Edocument omitted'),
    ],
    expectedPlatform: 'ios',
    expectedPatternId: 'ios-bracket',
    expectedOrder: 'DMY',
    expectedOrderSource: 'unambiguous',
    expectedClock: '12h',
    expectedSeconds: true,
  },
  {
    id: 'android-dmy-24h-group',
    description: 'Android export, DMY 24h, group lifecycle events.',
    lines: [
      `17/11/2026, 21:19 - ${ENCRYPTED}. Tap to learn more.`,
      '17/11/2026, 21:19 - Ali Khan created group "Family"',
      '17/11/2026, 21:20 - Ali Khan added Sara',
      '17/11/2026, 21:21 - Sara: Hi everyone',
      '17/11/2026, 21:22 - Sara left',
    ],
    expectedPlatform: 'android',
    expectedPatternId: 'android-dash',
    expectedOrder: 'DMY',
    expectedOrderSource: 'unambiguous',
    expectedClock: '24h',
    expectedSeconds: false,
  },
  {
    id: 'android-mdy-12h-1to1',
    description: 'Android export, MDY 12h, 1:1 chat.',
    lines: ['11/17/26, 9:25 PM - Bob: US-style 12h', '11/17/26, 9:26 PM - Alice: replies quickly'],
    expectedPlatform: 'android',
    expectedPatternId: 'android-dash',
    expectedOrder: 'MDY',
    expectedOrderSource: 'unambiguous',
    expectedClock: '12h',
    expectedSeconds: false,
  },
  {
    id: 'android-file-attached',
    description: 'Android export with `FILENAME (file attached)` markers and captions.',
    lines: [
      '17/11/2026, 21:22 - Ali Khan: IMG-20261117-WA0001.jpg (file attached)',
      'Caption on the next line',
      '17/11/2026, 21:23 - Ali Khan: VID-20261117-WA0002.mp4 (file attached)',
    ],
    expectedPlatform: 'android',
    expectedPatternId: 'android-dash',
    expectedOrder: 'DMY',
    expectedOrderSource: 'unambiguous',
    expectedClock: '24h',
    expectedSeconds: false,
  },
  {
    id: 'android-media-omitted',
    description: 'Android export made without media.',
    lines: [
      '17/11/2026, 21:23 - Sara: <Media omitted>',
      '17/11/2026, 21:24 - Ali Khan: image omitted',
    ],
    expectedPlatform: 'android',
    expectedPatternId: 'android-dash',
    expectedOrder: 'DMY',
    expectedOrderSource: 'unambiguous',
    expectedClock: '24h',
    expectedSeconds: false,
  },
  {
    id: 'android-system-with-colon',
    description: 'Android system event whose text contains a colon-space.',
    lines: [
      '17/11/2026, 21:24 - Ali Khan changed the subject from "Fam: old" to "Family"',
      '17/11/2026, 21:25 - Sara: normal message',
    ],
    expectedPlatform: 'android',
    expectedPatternId: 'android-dash',
    expectedOrder: 'DMY',
    expectedOrderSource: 'unambiguous',
    expectedClock: '24h',
    expectedSeconds: false,
  },
  {
    id: 'ymd-dates',
    description: 'Year-first (YMD) dates detected from a 4-digit first component.',
    lines: ['2026-11-17, 21:19 - Ali Khan: iso-ish dates', '2026-11-18, 08:00 - Sara: next day'],
    expectedPlatform: 'android',
    expectedPatternId: 'android-dash',
    expectedOrder: 'YMD',
    expectedOrderSource: 'unambiguous',
    expectedClock: '24h',
    expectedSeconds: false,
  },
  {
    id: 'two-digit-years',
    description: 'Two-digit years map to 2000+yy.',
    lines: ['[17/11/26, 21:19] Ali Khan: two-digit year', '[17/11/26, 21:20] Sara: likewise'],
    expectedPlatform: 'ios',
    expectedPatternId: 'ios-bracket',
    expectedOrder: 'DMY',
    expectedOrderSource: 'unambiguous',
    expectedClock: '24h',
    expectedSeconds: false,
  },
  {
    id: 'multiline-and-blank-lines',
    description: 'Multi-line messages including blank lines inside a message.',
    lines: [
      '[17/11/2026, 21:19] Ali Khan: poem start',
      '',
      'second stanza',
      '[17/11/2026, 21:20] Sara: reply',
    ],
    expectedPlatform: 'ios',
    expectedPatternId: 'ios-bracket',
    expectedOrder: 'DMY',
    expectedOrderSource: 'unambiguous',
    expectedClock: '24h',
    expectedSeconds: false,
  },
  {
    id: 'rtl-urdu-arabic-mixed',
    description: 'RTL Urdu/Arabic bodies with bidi marks preserved.',
    lines: ['[17/11/2026, 21:19] احمد: سلام! کیا حال ہے؟', '[17/11/2026, 21:20] Sara: مرحباً، بخير'],
    expectedPlatform: 'ios',
    expectedPatternId: 'ios-bracket',
    expectedOrder: 'DMY',
    expectedOrderSource: 'unambiguous',
    expectedClock: '24h',
    expectedSeconds: false,
  },
  {
    id: 'emoji-zwj',
    description: 'Emoji-only messages including ZWJ sequences.',
    lines: [
      '[17/11/2026, 21:19] Sara: \u{1F600}',
      '[17/11/2026, 21:20] Ali Khan: \u{1F468}\u200D\u{1F469}\u200D\u{1F467}\u200D\u{1F466}',
      '[17/11/2026, 21:21] Sara: \u{1F44D}\u{1F3FC}',
    ],
    expectedPlatform: 'ios',
    expectedPatternId: 'ios-bracket',
    expectedOrder: 'DMY',
    expectedOrderSource: 'unambiguous',
    expectedClock: '24h',
    expectedSeconds: false,
  },
  {
    id: 'polls',
    description: 'Android poll messages with vote counts.',
    lines: [
      '17/11/2026, 21:27 - Ali Khan: POLL:',
      'Dinner?',
      'OPTION: Biryani (2 votes)',
      'OPTION: Karahi (1 vote)',
      '17/11/2026, 21:28 - Sara: biryani please',
    ],
    expectedPlatform: 'android',
    expectedPatternId: 'android-dash',
    expectedOrder: 'DMY',
    expectedOrderSource: 'unambiguous',
    expectedClock: '24h',
    expectedSeconds: false,
  },
  {
    id: 'locations',
    description: 'Android shared locations with map URLs.',
    lines: [
      '17/11/2026, 21:26 - Sara: location: https://maps.google.com/?q=24.8607,67.0011',
      '17/11/2026, 21:27 - Ali Khan: location: https://maps.google.com/?q=-33.8688,151.2093',
    ],
    expectedPlatform: 'android',
    expectedPatternId: 'android-dash',
    expectedOrder: 'DMY',
    expectedOrderSource: 'unambiguous',
    expectedClock: '24h',
    expectedSeconds: false,
  },
  {
    id: 'contacts-vcf',
    description: 'Contact cards shared as .vcf attachments.',
    lines: [
      '17/11/2026, 21:29 - Ali Khan: IMG-20261117-WA0007.vcf (file attached)',
      '17/11/2026, 21:30 - Sara: saved it',
    ],
    expectedPlatform: 'android',
    expectedPatternId: 'android-dash',
    expectedOrder: 'DMY',
    expectedOrderSource: 'unambiguous',
    expectedClock: '24h',
    expectedSeconds: false,
  },
  {
    id: 'deleted-and-edited',
    description: 'Deleted placeholders and edited markers.',
    lines: [
      '[17/11/2026, 21:19] Sara: \u200EThis message was deleted.',
      '[17/11/2026, 21:20] Ali Khan: You deleted this message',
      '[17/11/2026, 21:21] Sara: See you soon \u200E<This message was edited>',
    ],
    expectedPlatform: 'ios',
    expectedPatternId: 'ios-bracket',
    expectedOrder: 'DMY',
    expectedOrderSource: 'unambiguous',
    expectedClock: '24h',
    expectedSeconds: false,
  },
  {
    id: 'calls',
    description: 'iOS call events.',
    lines: [
      '[17/11/2026, 21:19] Sara: \u200EVoice call',
      '[17/11/2026, 21:20] Sara: \u200EMissed video call',
    ],
    expectedPlatform: 'ios',
    expectedPatternId: 'ios-bracket',
    expectedOrder: 'DMY',
    expectedOrderSource: 'unambiguous',
    expectedClock: '24h',
    expectedSeconds: false,
  },
  {
    id: 'orphan-lines-before-first',
    description: 'Lines before the first header produce one counted warning.',
    lines: ['stray line one', 'stray line two', '[17/11/2026, 21:19] Ali Khan: real message'],
    expectedPlatform: 'ios',
    expectedPatternId: 'ios-bracket',
    expectedOrder: 'DMY',
    expectedOrderSource: 'unambiguous',
    expectedClock: '24h',
    expectedSeconds: false,
  },
  {
    id: 'out-of-order-timestamps',
    description: 'Backwards timestamps warn at most once per 1000 lines; order stays file order.',
    lines: [
      '[17/11/2026, 21:30] Ali Khan: later first',
      '[17/11/2026, 21:10] Sara: earlier second',
    ],
    expectedPlatform: 'ios',
    expectedPatternId: 'ios-bracket',
    expectedOrder: 'DMY',
    expectedOrderSource: 'unambiguous',
    expectedClock: '24h',
    expectedSeconds: false,
  },
  {
    id: 'ambiguous-date-order',
    description: 'All date components ≤ 12: DMY by default, user confirms in UI.',
    lines: [
      '[03/04/2026, 9:19 AM] Ali Khan: april third (DMY) or march fourth (MDY)?',
      '[03/05/2026, 9:20 AM] Sara: ambiguous indeed',
    ],
    expectedPlatform: 'ios',
    expectedPatternId: 'ios-bracket',
    expectedOrder: 'DMY',
    expectedOrderSource: 'default',
    expectedClock: '12h',
    expectedSeconds: false,
  },
  {
    id: 'crlf-and-bom',
    description: 'CRLF line endings and a UTF-8 BOM.',
    lines: [
      '[17/11/2026, 21:19] Ali Khan: windows line endings',
      '[17/11/2026, 21:20] Sara: with a BOM',
    ],
    crlf: true,
    bom: true,
    expectedPlatform: 'ios',
    expectedPatternId: 'ios-bracket',
    expectedOrder: 'DMY',
    expectedOrderSource: 'unambiguous',
    expectedClock: '24h',
    expectedSeconds: false,
  },
  {
    id: 'phone-number-authors',
    description: 'Authors that are bare phone numbers.',
    lines: [
      '17/11/2026, 21:19 - +92 300 1234567: pinging from a new number',
      '17/11/2026, 21:20 - +1 415 555 0100: got it',
    ],
    expectedPlatform: 'android',
    expectedPatternId: 'android-dash',
    expectedOrder: 'DMY',
    expectedOrderSource: 'unambiguous',
    expectedClock: '24h',
    expectedSeconds: false,
  },
  {
    id: 'author-with-colon-in-body',
    description: 'Author split happens at the FIRST colon-space only.',
    lines: [
      '[17/11/2026, 21:19] Ali Khan: meeting at 10:00 sharp',
      '[17/11/2026, 21:20] Sara: ok: see you then',
    ],
    expectedPlatform: 'ios',
    expectedPatternId: 'ios-bracket',
    expectedOrder: 'DMY',
    expectedOrderSource: 'unambiguous',
    expectedClock: '24h',
    expectedSeconds: false,
  },
];

/** Applies the variant's line endings and BOM to the rendered lines. */
function renderText(variant: VariantSpec): string {
  const joined = variant.lines.join('\n');
  const withEndings = variant.crlf === true ? joined.replace(/\n/g, '\r\n') : joined;
  return variant.bom === true ? `\uFEFF${withEndings}` : withEndings;
}

/** Writes one fixture directory (input, expected output, readme). */
function writeFixture(variant: VariantSpec): void {
  const text = renderText(variant);
  const detected = detectFormat(
    text,
    variant.localeHint === undefined ? {} : { localeHint: variant.localeHint },
  );
  if (!detected.ok) {
    throw new Error(`variant ${variant.id}: detection failed (${detected.error.code})`);
  }
  const detectedValue = detected.value;
  const mismatches: string[] = [];
  if (detectedValue.platform !== variant.expectedPlatform) mismatches.push('platform');
  if (detectedValue.headerPatternId !== variant.expectedPatternId)
    mismatches.push('headerPatternId');
  if (detectedValue.dateOrder !== variant.expectedOrder) mismatches.push('dateOrder');
  if (detectedValue.dateOrderSource !== variant.expectedOrderSource)
    mismatches.push('dateOrderSource');
  if (detectedValue.clock !== variant.expectedClock) mismatches.push('clock');
  if (detectedValue.hasSeconds !== variant.expectedSeconds) mismatches.push('hasSeconds');
  if (mismatches.length > 0) {
    throw new Error(
      `variant ${variant.id}: declared expectations disagree with detection: ${mismatches.join(', ')}`,
    );
  }
  const format: DetectedFormat = {
    ...detectedValue,
    platform: variant.expectedPlatform,
    headerPatternId: variant.expectedPatternId,
    dateOrder: variant.expectedOrder,
    dateOrderSource: variant.expectedOrderSource,
    clock: variant.expectedClock,
    hasSeconds: variant.expectedSeconds,
  };

  const parsed = parseChat(text, { format });
  if (!parsed.ok) {
    throw new Error(`variant ${variant.id}: parse failed`);
  }
  const expected = {
    format,
    messages: parsed.value.messages,
    participants: parsed.value.participants,
    warnings: parsed.value.warnings,
    stats: parsed.value.stats,
    parserVersion: PARSER_VERSION,
  };

  const dir = resolve(fixturesRoot, variant.id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, 'chat.txt'), text, 'utf8');
  writeFileSync(resolve(dir, 'expected.json'), `${JSON.stringify(expected, null, 2)}\n`, 'utf8');
  writeFileSync(resolve(dir, 'README.md'), `# ${variant.id}\n\n${variant.description}\n`, 'utf8');
  console.log(`wrote ${variant.id} (${expected.messages.length} messages)`);
}

for (const variant of VARIANTS) {
  writeFixture(variant);
}
console.log(`done: ${VARIANTS.length} fixtures in ${fixturesRoot}`);
