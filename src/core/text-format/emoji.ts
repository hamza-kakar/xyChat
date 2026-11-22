/**
 * Emoji-only detection for jumbomoji (AGENTS.md §12.5): a body made of one
 * to three emoji (whitespace between them allowed) renders larger. Counts
 * grapheme clusters, so ZWJ families, skin tones, flags and keycaps each
 * count as one emoji.
 */

/** Largest emoji count that still renders as jumbomoji. */
export const JUMBO_EMOJI_MAX = 3;

/** One grapheme that is a single emoji (pictographic, flag or keycap). */
const EMOJI_GRAPHEME =
  /^(?:\p{Extended_Pictographic}(?:\p{Emoji_Modifier}|\uFE0F|\u20E3|\u200D\p{Extended_Pictographic})*|\p{Regional_Indicator}{2}|[#*0-9]\uFE0F?\u20E3)$/u;

/** Whitespace-only grapheme. */
const WHITESPACE = /^\s+$/u;

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

/**
 * Counts the emoji in an emoji-only body.
 *
 * @param body The message body.
 * @returns The emoji count, or 0 when the body holds anything but emoji
 *   and whitespace (or nothing at all).
 * @example
 * emojiOnlyCount('👍🏽 🎉'); // 2
 * emojiOnlyCount('ok 👍'); // 0
 */
export function emojiOnlyCount(body: string): number {
  let count = 0;
  for (const { segment } of segmenter.segment(body)) {
    if (WHITESPACE.test(segment)) {
      continue;
    }
    if (!EMOJI_GRAPHEME.test(segment)) {
      return 0;
    }
    count += 1;
  }
  return count;
}

/**
 * True when the body should render as jumbomoji (1–3 emoji only).
 *
 * @param body The message body.
 * @returns Whether to enlarge it.
 */
export function isJumboEmoji(body: string): boolean {
  const count = emojiOnlyCount(body);
  return count >= 1 && count <= JUMBO_EMOJI_MAX;
}
