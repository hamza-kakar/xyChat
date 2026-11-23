/**
 * Offline (AGENTS.md §14, §19.5 flow 14): once the service worker has
 * precached the app, an offline reload boots it and an imported chat
 * opens with its messages. Needs OPFS: Chromium runs it, Linux WebKit
 * skips (ADR 0007).
 */
import { test, expect, type Page } from '@playwright/test';
import { cspViolations, installCspListener } from './helpers/csp-violations';
import { expectBootOrUnsupported, skipWithoutOpfs } from './helpers/skip-without-opfs';
import { importChat } from './helpers/import-ui';
import { buildIosGroupZipWithImage } from './helpers/chat-fixtures';

const appHeading = (page: Page) => page.getByRole('heading', { level: 1, name: 'waChatBack' });

/** True once the page is controlled and the precache holds entries. */
async function waitForPrecache(page: Page): Promise<void> {
  await page.waitForFunction(
    async () => {
      if (navigator.serviceWorker.controller === null) {
        return false;
      }
      for (const key of await caches.keys()) {
        const cache = await caches.open(key);
        if ((await cache.keys()).length > 0) {
          return true;
        }
      }
      return false;
    },
    undefined,
    { timeout: 30_000 },
  );
}

test('offline reload boots the app and opens an imported chat (flow 14)', async ({
  page,
  context,
}) => {
  await installCspListener(page);
  const booted = await expectBootOrUnsupported(page);
  await skipWithoutOpfs(page);
  test.skip(!booted, 'Engine not supported; storage flows run on Chromium.');

  await importChat(page, {
    blob: await buildIosGroupZipWithImage(),
    name: 'WhatsApp Chat - Family.zip',
  });

  // The document that registered the worker is not controlled by it; one
  // online reload puts the page under its control.
  await page.reload();
  await expect(appHeading(page)).toBeVisible({ timeout: 30_000 });
  await waitForPrecache(page);

  await context.setOffline(true);
  await page.goto('./#/');
  await page.reload();
  await expect(appHeading(page)).toBeVisible({ timeout: 30_000 });
  await page
    .getByRole('link', { name: /Family/u })
    .first()
    .click();
  await expect(page.getByRole('heading', { level: 1, name: 'Family' })).toBeVisible();
  await expect(page.getByRole('log').getByText('good evening all').first()).toBeVisible();
  await expect(cspViolations(page)).resolves.toEqual([]);
  await context.setOffline(false);
});
