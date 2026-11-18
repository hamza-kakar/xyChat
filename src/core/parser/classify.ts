/**
 * Message classification (AGENTS.md §8.6). Splits a header's REST into
 * author/body and assigns the message kind. The system check runs on the
 * whole REST before any `": "` split, because system texts can contain
 * `": "`.
 */
import type {
  MessageKind,
  ParsedAttachmentRef,
  ParsedLocation,
  ParsedPoll,
  SourcePlatform,
} from '../model';
import { mediaTypeForFileName } from './attachments';
import { LRM, cleanBodyLine, stripMarksBeforeMarker } from './normalize';
import type { LocalePatterns } from './locale/types';
import { en } from './locale/en';

/** The classification outcome for one message's body. */
export interface ClassifiedBody {
  readonly author: string | null;
  readonly kind: MessageKind;
  readonly body: string;
  readonly isEdited: boolean;
  readonly attachment: ParsedAttachmentRef | null;
  readonly poll: ParsedPoll | null;
  readonly location: ParsedLocation | null;
}

/** Joins first line and continuations with LF, trimming trailing whitespace. */
function joinBody(lines: readonly string[]): string {
  return lines.join('\n').trimEnd();
}

/*
 * Combined fast-path matchers: one anchored test per message short-circuits
 * the per-pattern loops (100k-message exports make the constant factor
 * matter). Alternation order is irrelevant here — these answer match /
 * no-match; the specific pattern is resolved only on a hit.
 */
const SYSTEM_ANY = new RegExp(en.system.map((re) => `(?:${re.source})`).join('|'), 'u');
const DELETED_ANY = new RegExp(en.deleted.map((re) => `(?:${re.source})`).join('|'), 'u');
const EDITED_ANY = new RegExp(en.edited.map((re) => `(?:${re.source})`).join('|'), 'u');
const OMITTED_ANY = new RegExp(en.omitted.map((o) => `(?:${o.re.source})`).join('|'), 'u');
const CALLS_ANY = new RegExp(en.calls.map((re) => `(?:${re.source})`).join('|'), 'u');

/** Drops a leading LRM or RLM from a chunk split out of a line. */
function stripLeadingMarks(text: string): string {
  return text.startsWith(LRM) || text.startsWith('\u200F') ? text.slice(1) : text;
}

/** True when the first line matches any of the anchored patterns. */
function matchesAny(lines: readonly string[], patterns: readonly RegExp[]): boolean {
  /* v8 ignore next -- callers always pass a non-empty lines array */
  const first = lines[0] ?? '';
  return patterns.some((re) => re.test(first));
}

/** Strips a trailing edited marker from the message's last line. */
function stripEditedMarker(lines: readonly string[], locale: LocalePatterns): readonly string[] {
  /* v8 ignore next -- lines always has at least the first body line */
  const last = lines.at(-1) ?? '';
  for (const re of locale.edited) {
    const m = re.exec(last);
    if (m !== null) {
      const copy = [...lines];
      copy[copy.length - 1] = last.slice(0, m.index).trimEnd();
      return copy;
    }
    /* v8 ignore next 2 -- the EDITED_ANY gate already matched one pattern */
  }
  return lines;
}

/** The unchanged core shared by every classification outcome. */
interface BodyCore {
  readonly author: string | null;
  /** The first body line — always present (callers guarantee it). */
  readonly firstLine: string;
  readonly lines: readonly string[];
  readonly isEdited: boolean;
}

/** Kind-specific payload beyond the shared core. */
interface BodyPayload {
  readonly body: string;
  readonly attachment?: ParsedAttachmentRef | null;
  readonly poll?: ParsedPoll | null;
  readonly location?: ParsedLocation | null;
}

/** Builds a ClassifiedBody from a core plus kind-specific payload. */
function makeBody(core: BodyCore, kind: MessageKind, payload: BodyPayload): ClassifiedBody {
  return {
    ...core,
    kind,
    body: payload.body,
    attachment: payload.attachment ?? null,
    poll: payload.poll ?? null,
    location: payload.location ?? null,
  };
}

/** System outcome for a matched whole-body or iOS group-author form. */
function systemBody(core: BodyCore): ClassifiedBody {
  return makeBody(core, 'system', {
    body: joinBody([stripMarksBeforeMarker(core.firstLine), ...core.lines.slice(1)]),
  });
}

/** Tries the system patterns against the first line; null when none match. */
function tryClassifySystem(
  firstLine: string,
  continuation: readonly string[],
  locale: LocalePatterns,
): ClassifiedBody | null {
  // SYSTEM_ANY is the union of locale.system, so one test decides.
  if (SYSTEM_ANY.test(firstLine)) {
    return systemBody({
      author: null,
      firstLine,
      lines: [firstLine, ...continuation],
      isEdited: false,
    });
  }
  return null;
}

/** Result of splitting `Author: body` at the first colon-space. */
interface AuthorSplit {
  readonly author: string;
  readonly bodyFirst: string;
}

/** Splits at the first `": "`, or returns null when there is none. */
function splitAuthor(rest: string): AuthorSplit | null {
  const colonIndex = rest.indexOf(': ');
  if (colonIndex < 0) {
    return null;
  }
  return {
    author: stripLeadingMarks(rest.slice(0, colonIndex)),
    bodyFirst: cleanBodyLine(rest.slice(colonIndex + 2)),
  };
}

/** Strips the edited marker when present; returns the edited last line. */
function tryStripEdited(
  lines: readonly string[],
  locale: LocalePatterns,
): { readonly lines: readonly string[]; readonly isEdited: boolean } {
  // EDITED_ANY is the union of locale.edited, so one test decides.
  /* v8 ignore next -- lines always has at least the first body line */
  if (EDITED_ANY.test(lines.at(-1) ?? '')) {
    return { lines: stripEditedMarker(lines, locale), isEdited: true };
  }
  return { lines, isEdited: false };
}

/** Builds a referenced attachment for a file name. */
function referencedAttachment(fileName: string): ParsedAttachmentRef {
  return { fileName, mediaType: mediaTypeForFileName(fileName), status: 'referenced' };
}

/** Contact cards are referenced vcf files. */
function kindForAttachment(attachment: ParsedAttachmentRef): MessageKind {
  return attachment.mediaType === 'contact-card' ? 'contact' : 'media';
}

/** Tries the platform-specific referenced-attachment markers. */
function tryReferencedAttachment(
  core: BodyCore,
  locale: LocalePatterns,
  platform: SourcePlatform,
): ClassifiedBody | null {
  const first = core.firstLine;
  if (platform === 'ios') {
    const m = locale.attachedIos.exec(first);
    if (m !== null) {
      const withoutMarker = first.replace(locale.attachedIos, '').trim();
      const captionLines =
        withoutMarker === '' ? core.lines.slice(1) : [withoutMarker, ...core.lines.slice(1)];
      // v8 ignore next -- capture group 1 always participates
      const attachment = referencedAttachment(m[1] ?? '');
      return makeBody(core, kindForAttachment(attachment), {
        body: joinBody(captionLines),
        attachment,
      });
    }
    return null;
  }
  const m = locale.attachedAndroid.exec(first);
  if (m !== null) {
    const attachment = referencedAttachment(m[1] ?? '');
    return makeBody(core, kindForAttachment(attachment), {
      body: joinBody(core.lines.slice(1)),
      attachment,
    });
  }
  return null;
}

/** Tries the omitted-media placeholders. */
function tryOmittedMedia(core: BodyCore, locale: LocalePatterns): ClassifiedBody | null {
  const first = core.firstLine;
  if (!OMITTED_ANY.test(first)) {
    return null;
  }
  for (const { re, mediaType } of locale.omitted) {
    if (re.test(first)) {
      return makeBody(core, 'media', {
        body: joinBody(core.lines.slice(1)),
        attachment: { fileName: null, mediaType, status: 'omitted' },
      });
    }
  }
  return null;
}

/** Parses `lat,lng` out of a maps URL, or returns null. */
function parseCoordinates(url: string): ParsedLocation | null {
  const m = /[?&]q=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/u.exec(url);
  if (m === null) {
    return null;
  }
  return { lat: Number(m[1]), lng: Number(m[2]), url };
}

/** Tries the shared-location body form. */
function tryLocation(core: BodyCore, locale: LocalePatterns): ClassifiedBody | null {
  const first = core.firstLine;
  if (!first.startsWith(locale.locationPrefix)) {
    return null;
  }
  const url = first.slice(locale.locationPrefix.length).trim();
  const coords = parseCoordinates(url);
  if (coords !== null) {
    return makeBody(core, 'location', { body: '', location: coords });
  }
  return makeBody(core, 'text', { body: joinBody(core.lines) });
}

/** Extracts a poll payload from the lines following `POLL:` (§8.6: the next
 * line is the question). `lines` may be empty for a bare `POLL:` body. */
function parsePoll(lines: readonly string[], locale: LocalePatterns): ParsedPoll | null {
  const question = lines[0] ?? '';
  if (question === '') {
    return null;
  }
  const options: { readonly text: string; readonly votes: number | null }[] = [];
  for (const line of lines.slice(1)) {
    const m = locale.pollOption.exec(line);
    if (m === null) {
      return null;
    }
    options.push({
      /* v8 ignore next */ text: m[1] ?? '',
      /* v8 ignore next */ votes: m[2] === undefined ? null : Number(m[2]),
    });
  }
  return options.length === 0 ? null : { question, options };
}

/** Tries the poll body form. */
function tryPoll(core: BodyCore, locale: LocalePatterns): ClassifiedBody | null {
  const first = core.firstLine;
  if (!first.startsWith(locale.pollPrefix)) {
    return null;
  }
  const poll = parsePoll(core.lines.slice(1), locale);
  return poll !== null
    ? makeBody(core, 'poll', { body: '', poll })
    : makeBody(core, 'text', { body: joinBody(core.lines) });
}

/** Tries the exact call bodies from the locale table. */
function tryCall(core: BodyCore, locale: LocalePatterns): ClassifiedBody | null {
  // CALLS_ANY is the union of locale.calls, so one test decides.
  if (CALLS_ANY.test(core.firstLine)) {
    return makeBody(core, 'call', {
      body: joinBody([stripMarksBeforeMarker(core.firstLine)]),
    });
  }
  return null;
}

/** Assigns the message kind for an authored body (§8.6.4, in order). */
function classifyKind(
  core: BodyCore,
  locale: LocalePatterns,
  platform: SourcePlatform,
): ClassifiedBody {
  // DELETED_ANY is the union of locale.deleted, so one test decides.
  if (DELETED_ANY.test(core.firstLine)) {
    return makeBody(core, 'deleted', {
      body: joinBody([stripMarksBeforeMarker(core.firstLine)]),
    });
  }
  const chained: readonly ((c: BodyCore) => ClassifiedBody | null)[] = [
    (c) => tryReferencedAttachment(c, locale, platform),
    (c) => tryOmittedMedia(c, locale),
    (c) => tryLocation(c, locale),
    (c) => tryPoll(c, locale),
    (c) => tryCall(c, locale),
  ];
  for (const step of chained) {
    const outcome = step(core);
    if (outcome !== null) {
      return outcome;
    }
  }
  return makeBody(core, 'text', { body: joinBody(core.lines) });
}

/**
 * Classifies one message.
 *
 * @param rest The header's REST (first body line, cleaned form).
 * @param continuationLines Body lines that followed the header line.
 * @param locale Active locale pattern table.
 * @param platform Detected export platform (marker styles differ).
 * @example
 * classifyBody('Sara: hi there', [], en, 'ios');
 * // { author: 'Sara', kind: 'text', body: 'hi there', ... }
 */
export function classifyBody(
  rest: string,
  continuationLines: readonly string[],
  locale: LocalePatterns,
  platform: SourcePlatform,
): ClassifiedBody {
  const firstLine = cleanBodyLine(rest);

  // 1. System check on the whole REST, before any author split (§8.6.1).
  const wholeRestSystem = tryClassifySystem(firstLine, continuationLines, locale);
  if (wholeRestSystem !== null) {
    return wholeRestSystem;
  }

  // 2. Split at the first ": " (§8.6.2), or 3. unknown system event (§8.6.3).
  const split = splitAuthor(rest);
  if (split === null) {
    return {
      author: null,
      kind: 'system',
      body: joinBody([firstLine, ...continuationLines]),
      isEdited: false,
      attachment: null,
      poll: null,
      location: null,
    };
  }

  const authoredLines = [split.bodyFirst, ...continuationLines.map(cleanBodyLine)];
  const iosSystem = tryClassifySystem(
    split.bodyFirst,
    continuationLines.map(cleanBodyLine),
    locale,
  );
  if (iosSystem !== null) {
    return iosSystem;
  }

  // 4. Body-kind classification; edited marker first (§8.6.4).
  const edited = tryStripEdited(authoredLines, locale);
  const core: BodyCore = {
    author: split.author,
    firstLine: split.bodyFirst,
    lines: edited.lines,
    isEdited: edited.isEdited,
  };
  return classifyKind(core, locale, platform);
}
