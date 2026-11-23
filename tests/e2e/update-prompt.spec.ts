/**
 * E2E flow 15: a new service worker shows the
 * "Update available" toast, which waits while an import runs and reloads
 * only on tap. The build is served by a local release server that can
 * publish a byte-different sw.js. Needs a booted app (OPFS): Chromium runs
 * it, Linux WebKit skips (ADR 0007).
 */
import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { cspViolations, installCspListener } from './helpers/csp-violations';
import { openPicker, pickFile } from './helpers/import-ui';
import { buildIosGroupZip } from './helpers/import-fixtures';
import { startReleaseServer, type ReleaseServer } from './helpers/release-server';
import { skipWithoutOpfs } from './helpers/skip-without-opfs';

let server: ReleaseServer;

test.beforeEach(async () => {
  server = await startReleaseServer();
});

test.afterEach(async () => {
  await server.close();
});

const appHeading = (page: Page) => page.getByRole('heading', { level: 1, name: 'xyChat' });

/** Opens the app and waits until the service worker controls the page. A
 * worker only waits while it has a page to wait for, so the first visit
 * reloads once to come under its control. */
async function openControlledApp(page: Page): Promise<void> {
  await installCspListener(page);
  await page.goto(server.url);
  await skipWithoutOpfs(page);
  await expect(appHeading(page)).toBeVisible({ timeout: 30_000 });
  await page.waitForFunction(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    return registration?.active?.state === 'activated';
  });
  await page.reload();
  await expect(appHeading(page)).toBeVisible({ timeout: 30_000 });
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
}

/** Publishes the next release and waits until its worker is waiting. */
async function installNextRelease(page: Page): Promise<void> {
  server.publishNextRelease();
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    await registration?.update();
  });
  await page.waitForFunction(
    async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      return registration?.waiting?.state === 'installed';
    },
    undefined,
    { timeout: 30_000 },
  );
}

test('flow 15: the update prompt reloads only on tap', async ({ page }) => {
  await openControlledApp(page);
  const toast = page.getByText('Update available');
  await expect(toast).toHaveCount(0);

  await installNextRelease(page);
  await expect(toast).toBeVisible();
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations).toEqual([]);

  // Nothing reloads or activates by itself.
  await page.waitForTimeout(1_000);
  await expect(toast).toBeVisible();
  const stillWaiting = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    return registration?.waiting !== null;
  });
  expect(stillWaiting).toBe(true);

  const reloaded = page.waitForEvent('load');
  await page.getByRole('button', { name: 'Reload' }).click();
  await reloaded;
  await expect(appHeading(page)).toBeVisible({ timeout: 30_000 });
  await expect(toast).toHaveCount(0);
  const waitingAfter = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    return registration?.waiting ?? null;
  });
  expect(waitingAfter).toBeNull();
  await expect(cspViolations(page)).resolves.toEqual([]);
});

test('flow 15: the update prompt waits while an import runs', async ({ page }) => {
  await openControlledApp(page);
  await openPicker(page);
  await pickFile(page, await buildIosGroupZip(), 'WhatsApp Chat - Family.zip');
  await expect(page.getByText('Confirm import')).toBeVisible({ timeout: 30_000 });

  await installNextRelease(page);
  const toast = page.getByText('Update available');
  await page.waitForTimeout(1_000);
  await expect(toast).toHaveCount(0);

  await page.getByRole('button', { name: 'Start import' }).click();
  await expect(page.getByText('Import complete')).toBeVisible({ timeout: 30_000 });
  await expect(toast).toBeVisible();
  await expect(cspViolations(page)).resolves.toEqual([]);
});
