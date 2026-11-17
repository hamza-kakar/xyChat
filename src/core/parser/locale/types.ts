/**
 * Locale pattern tables (AGENTS.md §8.7). Every user-visible phrase the
 * parser must recognize lives in one of these tables; adding a language is a
 * new table file plus fixtures, with no logic changes. All regexes are
 * anchored, use the `u` flag, and are linear-time (property-tested under
 * §19.2's timing budget).
 */
import type { MediaType } from '../../model';

/** A locale's phrase table, matched against normalized message bodies. */
export interface LocalePatterns {
  /** BCP-47-ish identifier of the exporting phone's UI language. */
  readonly id: string;
  /** Meridiem tokens as written in exports, normalized by the matcher. */
  readonly meridiem: { readonly am: readonly string[]; readonly pm: readonly string[] };
  /** Whole-body system event patterns (checked before author splitting). */
  readonly system: readonly RegExp[];
  /** Deleted-message bodies. */
  readonly deleted: readonly RegExp[];
  /** Trailing "edited" markers, stripped with `isEdited` set. */
  readonly edited: readonly RegExp[];
  /** Omitted-media placeholders and the media type each implies. */
  readonly omitted: readonly { readonly re: RegExp; readonly mediaType: MediaType }[];
  /** iOS `<attached: FILENAME>` marker; capture 1 is the file name. */
  readonly attachedIos: RegExp;
  /** Android `FILENAME (file attached)` first-line marker; capture 1 is the name. */
  readonly attachedAndroid: RegExp;
  /** Call event bodies (exact match after trimming). */
  readonly calls: readonly RegExp[];
  /** Poll body prefix. */
  readonly pollPrefix: string;
  /** One poll option line: capture 1 text, capture 2 vote count. */
  readonly pollOption: RegExp;
  /** Shared-location body prefix. */
  readonly locationPrefix: string;
}
