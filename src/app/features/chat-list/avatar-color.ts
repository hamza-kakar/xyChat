/** Number of participant/avatar colors. */
export const PALETTE_SIZE = 12;

/** Stable palette index from a title (FNV-1a), same on every launch. */
export function paletteIndexFor(text: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash = Math.imul(hash ^ text.charCodeAt(index), 0x01000193) >>> 0;
  }
  return hash % PALETTE_SIZE;
}

/** Up to two initials, by grapheme so emoji and accents stay whole. */
export function initialsOf(title: string): string {
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  return title
    .trim()
    .split(/\s+/u)
    .slice(0, 2)
    .map((word) => segmenter.segment(word)[Symbol.iterator]().next().value?.segment ?? '')
    .join('')
    .toLocaleUpperCase();
}
