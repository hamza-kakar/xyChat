import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { test } from '@playwright/test';

/**
 * Boot-dependent flow guard.
 *
 * Nothing is skipped at boot: on engines where the capability gate refuses
 * (Playwright's Linux WebKit cannot open OPFS — upstream
 * microsoft/playwright#18235), the caller asserts the unsupported screen:
 * heading visible, axe-clean, no CSP violations. Storage-dependent flows
 * (offline reload) use {@link skipWithoutOpfs} AFTER navigating, so the probe
 * runs in the app origin, never on about:blank.
 */

/** Detects OPFS support in the CURRENT page origin (navigate first!). */
async function opfsSupported(page: Page): Promise<boolean> {
  return page.evaluate(async () => {
    try {
      await navigator.storage.getDirectory();
      return true;
    } catch {
      return false;
    }
  });
}

/**
 * Navigates and asserts the app boots (home heading) — on engines whose
 * capability gate refuses, asserts the unsupported screen instead. Waits
 * until EXACTLY one of the two headings is visible (React StrictMode can
 * briefly unmount a heading during the double effect pass, so an instant
 * `isVisible` check races that window), then returns whether the app booted.
 */
export async function expectBootOrUnsupported(page: Page): Promise<boolean> {
  await page.goto('/');
  const homeHeading = page.getByRole('heading', { level: 1, name: 'xyChat' });
  const unsupportedHeading = page.getByRole('heading', {
    level: 1,
    name: 'This browser isn’t supported',
  });
  await expect
    .poll(
      async () => {
        const home = await homeHeading.isVisible();
        const unsupported = await unsupportedHeading.isVisible();
        return home !== unsupported;
      },
      { timeout: 15_000, intervals: [150, 250] },
    )
    .toBe(true);
  // Exactly one heading is visible now and the state is stable; a fresh
  // visibility read decides which screen rendered.
  const booted = await homeHeading.isVisible();
  if (!booted) {
    // The capability gate refused: assert the unsupported screen fully rendered.
    await expect(unsupportedHeading).toBeVisible();
  }
  return booted;
}

/** Skips the test when the engine lacks OPFS (storage-dependent flows only). */
export async function skipWithoutOpfs(page: Page): Promise<void> {
  const supported = await opfsSupported(page);
  test.skip(
    !supported,
    'Engine lacks OPFS (Playwright WebKit on Linux, microsoft/playwright#18235); ' +
      'covered by Chromium and manual iOS testing per docs/TESTING.md.',
  );
}
