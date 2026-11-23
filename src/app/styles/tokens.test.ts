import { describe, expect, it } from 'vitest';
// Vitest stubs .css imports (even with ?raw) and rewrites import.meta.url to
// a non-file scheme, so the source is read relative to the project root.
import { readFileSync } from 'node:fs';
import { formatString } from '../i18n/format-string';

const tokensCss = readFileSync('src/app/styles/tokens.css', 'utf8');

/** Collects `--token: #hex` declarations out of a CSS block body. */
function collectTokens(body: string): Map<string, string> {
  const tokens = new Map<string, string>();
  for (const match of body.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    const name = match[1];
    const hex = match[2];
    if (name !== undefined && hex !== undefined) {
      tokens.set(name, hex);
    }
  }
  return tokens;
}

/** Parses the body of the first block following `selector`. */
function blockAfter(selector: string): string {
  const index = tokensCss.indexOf(selector);
  expect(index, `selector ${selector} present in tokens.css`).toBeGreaterThanOrEqual(0);
  let depth = 0;
  let start = -1;
  for (let i = index; i < tokensCss.length; i += 1) {
    const char = tokensCss[i];
    if (char === '{') {
      depth += 1;
      if (depth === 1) {
        start = i;
      }
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return tokensCss.slice(start + 1, i);
      }
    }
  }
  return '';
}

/** The :root block holds the dark primitives and the light defaults. */
const rootTokens = collectTokens(blockAfter(':root'));

/** Light value of a token (its literal in :root). */
function light(name: string): string | undefined {
  return rootTokens.get(name);
}

/** Dark value: the `--dark-<name>` primitive (single source of truth). */
function dark(name: string): string | undefined {
  return rootTokens.get(`dark-${name}`);
}

function channel(value: number): number {
  const ratio = value / 255;
  return ratio <= 0.04045 ? ratio / 12.92 : ((ratio + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance of an sRGB hex color. */
function luminance(hex: string): number {
  const red = Number.parseInt(hex.slice(1, 3), 16);
  const green = Number.parseInt(hex.slice(3, 5), 16);
  const blue = Number.parseInt(hex.slice(5, 7), 16);
  return 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue);
}

/** WCAG contrast ratio between two hex colors. */
export function contrastRatio(foreground: string, background: string): number {
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

/** Text/background pairs that must satisfy WCAG AA body text. */
const CONTRAST_PAIRS: readonly (readonly [string, string])[] = [
  ['text', 'surface'],
  ['text', 'surface-raised'],
  ['text-on-bubble', 'bubble-in'],
  ['text-on-bubble', 'bubble-out'],
  ['text-muted', 'surface'],
  ['text-muted', 'surface-raised'],
  ['accent-contrast', 'accent'],
  ['danger-contrast', 'danger'],
  ['text-muted-on-bubble', 'bubble-in'],
  ['text-muted-on-bubble', 'bubble-out'],
  ['link-on-bubble', 'bubble-in'],
  ['link-on-bubble', 'bubble-out'],
  // Search matches (<mark>) in results and in bubbles.
  ['text', 'highlight'],
  ['text-on-bubble', 'highlight'],
  // Participant names: on incoming bubbles, and as avatar initials
  // on the list surfaces.
  ...Array.from({ length: 12 }, (_unused, index) => [
    ...(['bubble-in', 'surface', 'surface-raised'] as const).map(
      (background) => [`name-${String(index)}`, background] as const,
    ),
  ]).flat(),
];

describe('design token contrast', () => {
  it('defines every dark primitive used by the mapping blocks', () => {
    // Every var(--dark-x) referenced in the mapping must exist in :root.
    for (const match of tokensCss.matchAll(/var\(--dark-([\w-]+)\)/g)) {
      const name = match[1];
      expect(name !== undefined && rootTokens.has(`dark-${name}`), `--dark-${name}`).toBe(true);
    }
  });

  it.each(CONTRAST_PAIRS)(
    'light theme: %s on %s meets WCAG AA (4.5:1)',
    (foreground, background) => {
      const fg = light(foreground);
      const bg = light(background);
      expect(fg, formatString('light token --{name}', { name: foreground })).toBeDefined();
      expect(bg, formatString('light token --{name}', { name: background })).toBeDefined();
      if (fg !== undefined && bg !== undefined) {
        expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(4.5);
      }
    },
  );

  it.each(CONTRAST_PAIRS)(
    'dark theme: %s on %s meets WCAG AA (4.5:1)',
    (foreground, background) => {
      const fg = dark(foreground);
      const bg = dark(background);
      expect(fg, formatString('dark token --dark-{name}', { name: foreground })).toBeDefined();
      expect(bg, formatString('dark token --dark-{name}', { name: background })).toBeDefined();
      if (fg !== undefined && bg !== undefined) {
        expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(4.5);
      }
    },
  );
});
