/** Fixture variant definitions, part 1 (AGENTS.md §19.2 data). */
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
}

/** iOS DMY 12h header with seconds (narrow nbsp inserted by default). */
export const ios = (header: IosHeader, rest: string): string =>
  `[${header.day}/11/2026, ${header.h12}:${String(header.m).padStart(2, '0')}:${String(header.s).padStart(2, '0')}\u202F${header.meridiem}] ${rest}`;

/** The canonical WhatsApp encrypted notice (Android form). */
export const ENCRYPTED =
  'Messages and calls are end-to-end encrypted. No one outside of this chat, not even WhatsApp, can read or listen to them.';

/** Variant definitions rendered by scripts/generate-fixtures.ts. */
export const VARIANTS_PART1: readonly VariantSpec[] = [
{
    id: 'ios-dmy-12h-seconds-group',
    description: 'iOS export, DMY dates, 12h clock with seconds, group chat with system events.',
    lines: [
      ios({ day: 17, h12: 9, m: 19, s: 3, meridiem: 'PM' }, 'Ali Khan: Hello there'),
      ios({ day: 17, h12: 9, m: 19, s: 30, meridiem: 'PM' }, 'Sara: line one\nline two of the same message'),
      ios(
        { day: 17, h12: 9, m: 20, s: 1, meridiem: 'PM' },
        'Family Group: \u200EMessages and calls are end-to-end encrypted. No one outside of this chat, not even WhatsApp, can read or listen to them.',
      ),
      ios({ day: 17, h12: 9, m: 21, s: 0, meridiem: 'PM' }, 'Ali Khan: \u200Eimage omitted'),
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
      ios({ day: 17, h12: 9, m: 20, s: 1, meridiem: 'PM' }, 'Sara: \u200E<attached: 00000012-PHOTO-2026-11-17-21-20-01.jpg>'),
      'sunset at the beach',
      ios({ day: 17, h12: 9, m: 21, s: 0, meridiem: 'PM' }, 'Ali Khan: \u200E<attached: 00000013-VIDEO-2026-11-17-21-21-00.mp4>'),
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
      ios({ day: 17, h12: 9, m: 19, s: 0, meridiem: 'PM' }, 'Family Group: \u200EAli Khan added Sara'),
      ios({ day: 17, h12: 9, m: 19, s: 30, meridiem: 'PM' }, 'Sara: thanks for adding me'),
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
      ios({ day: 17, h12: 9, m: 19, s: 0, meridiem: 'PM' }, 'Ali Khan: \u200Eimage omitted'),
      ios({ day: 17, h12: 9, m: 19, s: 30, meridiem: 'PM' }, 'Sara: \u200Evideo omitted'),
      ios({ day: 17, h12: 9, m: 20, s: 0, meridiem: 'PM' }, 'Sara: \u200Eaudio omitted'),
      ios({ day: 17, h12: 9, m: 20, s: 30, meridiem: 'PM' }, 'Sara: \u200Esticker omitted'),
      ios({ day: 17, h12: 9, m: 21, s: 0, meridiem: 'PM' }, 'Ali Khan: \u200EGIF omitted'),
      ios({ day: 17, h12: 9, m: 21, s: 30, meridiem: 'PM' }, 'Sara: \u200Edocument omitted'),
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
];
