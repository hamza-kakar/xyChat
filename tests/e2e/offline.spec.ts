import { test, expect } from '@playwright/test';
import { cspViolations, installCspListener } from './helpers/csp-violations';

test.beforeEach(async ({ page }) => {
  await installCspListener(page);
});

test('app reloads offline after the service worker activates', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'waChatBack' })).toBeVisible();

  await page.waitForFunction(async () => {
    const registrations = await navigator.serviceWorker.getRegistrations();
    return registrations.some((registration) => registration.active !== null);
  });

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'waChatBack' })).toBeVisible();
  await expect(cspViolations(page)).resolves.toEqual([]);
  await context.setOffline(false);
});
