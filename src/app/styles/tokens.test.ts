import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Vitest stubs .css imports (even with ?raw) and rewrites import.meta.url to
// a non-file scheme, so the source is read relative to the project root.
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

/**
 * Parses a CSS block into `--token: #hex` pairs, recursing into nested braces.
 */
function parseBlock(source: string, start: number): Map<string, string> {
  let depth = 0;
  let blockStart = -1;
  for (let i = start; i < source.length; i += 1) {
    const char = source[i];
    if (char === '{') {
      depth += 1;
      if (depth === 1) {
        blockStart = i;
      }
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return collectTokens(source.slice(blockStart + 1, i));
      }
    }
  }
  return new Map();
}

function tokenBlock(selector: string): Map<string, string> {
  const index = tokensCss.indexOf(selector);
  expect(index, `selector ${selector} present in tokens.css`).toBeGreaterThanOrEqual(0);
  return parseBlock(tokensCss, index);
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

/** Text/background pairs that must satisfy WCAG AA body text (AGENTS.md §12.2). */
const CONTRAST_PAIRS: readonly (readonly [string, string])[] = [
  ['text', 'surface'],
  ['text', 'surface-raised'],
  ['text-on-bubble', 'bubble-in'],
  ['text-on-bubble', 'bubble-out'],
  ['text-muted', 'surface'],
  ['text-muted', 'surface-raised'],
  ['accent-contrast', 'accent'],
  ['danger-contrast', 'danger'],
];

describe('design token contrast', () => {
  const themes: readonly { readonly name: string; readonly selector: string }[] = [
    { name: 'light', selector: ':root' },
    { name: 'dark', selector: ":root[data-theme='dark']" },
  ];

  for (const theme of themes) {
    it(`${theme.name} theme meets WCAG AA (4.5:1) for all text pairs`, () => {
      const tokens = tokenBlock(theme.selector);
      for (const [foreground, background] of CONTRAST_PAIRS) {
        const fg = tokens.get(foreground);
        const bg = tokens.get(background);
        expect(fg, `${theme.name} token --${foreground}`).toBeDefined();
        expect(bg, `${theme.name} token --${background}`).toBeDefined();
        if (fg !== undefined && bg !== undefined) {
          expect(
            contrastRatio(fg, bg),
            `${theme.name}: ${foreground} on ${background}`,
          ).toBeGreaterThanOrEqual(4.5);
        }
      }
    });
  }
});
