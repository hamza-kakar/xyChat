import { test, expect } from '@playwright/test';
import { cspViolations, installCspListener } from './helpers/csp-violations';

test.beforeEach(async ({ page }) => {
  await installCspListener(page);
});

test('app reloads offline after the service worker activates', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'waChatBack' })).toBeVisible();

  // Wait until the page is actually controlled by an activated service
  // worker AND precaching has produced cache entries, so the offline reload
  // is guaranteed to be served from Cache Storage rather than the network.
  await page.waitForFunction(
    async () => {
      const controller = navigator.serviceWorker.controller;
      if (controller === null) {
        return false;
      }
      const keys = await caches.keys();
      for (const key of keys) {
        const cache = await caches.open(key);
        const requests = await cache.keys();
        if (requests.length > 0) {
          return true;
        }
      }
      return false;
    },
    { timeout: 30_000 },
  );

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'waChatBack' })).toBeVisible();
  await expect(cspViolations(page)).resolves.toEqual([]);
  await context.setOffline(false);
});
