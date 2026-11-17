import { test, expect } from '@playwright/test';
import { cspViolations, installCspListener } from './helpers/csp-violations';

test.beforeEach(async ({ page }) => {
  await installCspListener(page);
});

test('app reloads offline after the service worker activates', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'waChatBack' })).toBeVisible();

  // Wait not only for activation but for precaching to finish, so the reload
  // is guaranteed to be served from Cache Storage.
  await page.waitForFunction(
    async () => {
      const registrations = await navigator.serviceWorker.getRegistrations();
      const active = registrations.some((registration) => registration.active !== null);
      if (!active) {
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
