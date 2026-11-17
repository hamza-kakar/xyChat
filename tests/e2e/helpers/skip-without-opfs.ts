import type { Page } from '@playwright/test';
import { test } from '@playwright/test';

/**
 * Skips the test when the browser engine cannot open the Origin Private File
 * System. Playwright's bundled Linux WebKit build has no working OPFS
 * (upstream: microsoft/playwright#18235) — the app's capability gate
 * correctly refuses to boot there. OPFS flows remain covered on Chromium in
 * CI and on real iOS Safari via docs/TESTING.md.
 *
 * @param page Playwright page used to probe engine-level OPFS support.
 */
export async function skipWithoutOpfs(page: Page): Promise<void> {
  const supported = await page.evaluate(async () => {
    try {
      await navigator.storage.getDirectory();
      return true;
    } catch {
      return false;
    }
  });
  test.skip(
    !supported,
    'Engine lacks OPFS (Playwright WebKit on Linux, microsoft/playwright#18235); ' +
      'covered by Chromium e2e and manual iOS testing per docs/TESTING.md.',
  );
}
