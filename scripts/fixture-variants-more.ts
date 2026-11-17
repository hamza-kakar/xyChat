/** Fixture variant definitions, part 2 (AGENTS.md §19.2 data). */
import type { DetectedFormat } from '../src/core/parser';
import type { ClockFormat, DateOrder, SourcePlatform } from '../src/core/model';

export type VariantPatternId = DetectedFormat['headerPatternId'];

/** Locale hint for detection, where the variant needs one. */
export interface VariantSpec {
  readonly id: string;
  readonly description: string;
  readonly lines: readonly string[];
  /** Line endings and BOM are applied at render time (default LF, no BOM). */
  readonly crlf?: boolean;
  readonly bom?: boolean;
  readonly localeHint?: string;
  readonly expectedPlatform: SourcePlatform;
  readonly expectedPatternId: VariantPatternId;
  readonly expectedOrder: DateOrder;
  readonly expectedOrderSource: DetectedFormat['dateOrderSource'];
  readonly expectedClock: ClockFormat;
  readonly expectedSeconds: boolean;
}

/** Shape options for the iOS 12h header builder. */
export interface IosHeader {
  readonly day: number;
  readonly h12: number;
  readonly m: number;
  readonly s: number;
  readonly meridiem: 'AM' | 'PM';
  readonly rest: string;
}

/** iOS DMY 12h header with seconds (narrow nbsp inserted by default). */
export const ios = (header: IosHeader): string =>
  `[${header.day}/11/2026, ${header.h12}:${String(header.m).padStart(2, '0')}:${String(header.s).padStart(2, '0')}\u202F${header.meridiem}] ${header.rest}`;

/** The canonical WhatsApp encrypted notice (Android form). */
export const ENCRYPTED =
  'Messages and calls are end-to-end encrypted. No one outside of this chat, not even WhatsApp, can read or listen to them.';

/** Variant definitions rendered by scripts/generate-fixtures.ts. */
export const VARIANTS_PART2: readonly VariantSpec[] = [
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
