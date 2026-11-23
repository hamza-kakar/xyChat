/**
 * iOS launch images: the device sizes, their file names and
 * the `apple-touch-startup-image` link tags. The images themselves are drawn
 * by `generate-icons.ts`; `vite.config.ts` puts the tags into index.html.
 * iOS only shows a launch image whose media query matches the device
 * exactly, so every supported iPhone screen (iOS 17+) has its own entry.
 */

/** One iPhone screen in CSS pixels (portrait) and its pixel ratio. */
export interface SplashScreen {
  readonly width: number;
  readonly height: number;
  readonly ratio: number;
}

export type SplashTheme = 'light' | 'dark';

/** Launch backgrounds: the `surface` token of each theme. */
export const SPLASH_BACKGROUNDS: Readonly<Record<SplashTheme, readonly [number, number, number]>> =
  {
    light: [0xf6, 0xf7, 0xf8],
    dark: [0x10, 0x14, 0x13],
  };

/** The icon's edge on the launch image, in CSS pixels. */
export const SPLASH_ICON_CSS_PX = 128;

/** iPhone screens that run iOS 17 or later. */
export const SPLASH_SCREENS: readonly SplashScreen[] = [
  { width: 375, height: 667, ratio: 2 }, // SE (2nd and 3rd gen)
  { width: 414, height: 896, ratio: 2 }, // XR, 11
  { width: 375, height: 812, ratio: 3 }, // XS, 11 Pro, 12 mini, 13 mini
  { width: 414, height: 896, ratio: 3 }, // XS Max, 11 Pro Max
  { width: 390, height: 844, ratio: 3 }, // 12, 13, 14, 16e
  { width: 428, height: 926, ratio: 3 }, // 12 Pro Max, 13 Pro Max, 14 Plus
  { width: 393, height: 852, ratio: 3 }, // 14 Pro, 15, 15 Pro, 16
  { width: 430, height: 932, ratio: 3 }, // 14 Pro Max, 15 Plus, 15 Pro Max, 16 Plus
  { width: 402, height: 874, ratio: 3 }, // 16 Pro, 17, 17 Pro
  { width: 420, height: 912, ratio: 3 }, // Air
  { width: 440, height: 956, ratio: 3 }, // 16 Pro Max, 17 Pro Max
];

/** Path of a launch image relative to the site root (no leading slash, so
 * it resolves against the deployment's base path). */
export function splashPath(screen: SplashScreen, theme: SplashTheme): string {
  return `splash/splash-${String(screen.width * screen.ratio)}x${String(screen.height * screen.ratio)}-${theme}.png`;
}

/** The media query iOS matches against the device for one launch image. */
export function splashMedia(screen: SplashScreen, theme: SplashTheme): string {
  return [
    `(device-width: ${String(screen.width)}px)`,
    `(device-height: ${String(screen.height)}px)`,
    `(-webkit-device-pixel-ratio: ${String(screen.ratio)})`,
    '(orientation: portrait)',
    `(prefers-color-scheme: ${theme})`,
  ].join(' and ');
}

/** Every launch image with its theme, in a stable order. */
export function splashImages(): readonly {
  readonly screen: SplashScreen;
  readonly theme: SplashTheme;
}[] {
  const themes: readonly SplashTheme[] = ['light', 'dark'];
  return SPLASH_SCREENS.flatMap((screen) => themes.map((theme) => ({ screen, theme })));
}

/** The `<link rel="apple-touch-startup-image">` tags for index.html. */
export function splashLinkTags(): string {
  return splashImages()
    .map(
      ({ screen, theme }) =>
        `<link rel="apple-touch-startup-image" media="${splashMedia(screen, theme)}" href="${splashPath(screen, theme)}" />`,
    )
    .join('\n    ');
}
