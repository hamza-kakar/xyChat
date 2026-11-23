/**
 * Chat info, settings and app lock e2e. Chromium runs the storage path;
 * WebKit skips (ADR 0007).
 */
import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { cspViolations, installCspListener } from './helpers/csp-violations';
import { expectBootOrUnsupported, skipWithoutOpfs } from './helpers/skip-without-opfs';
import { importChat } from './helpers/import-ui';
import { countOpfsMediaFiles } from './helpers/import-fixtures';
import { buildIosGroupZipWithImage } from './helpers/chat-fixtures';

test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ page }) => {
  await installCspListener(page);
  const booted = await expectBootOrUnsupported(page);
  await skipWithoutOpfs(page);
  test.skip(!booted, 'Engine not supported; storage flows run on Chromium.');
});

test.afterEach(async ({ page }) => {
  await expect(cspViolations(page)).resolves.toEqual([]);
});

async function expectAxeClean(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
}

async function setVisibility(page: Page, state: 'hidden' | 'visible'): Promise<void> {
  await page.evaluate((value) => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value });
    document.dispatchEvent(new Event('visibilitychange'));
  }, state);
}

test('chat info, storage per chat, and delete frees the media', async ({ page }) => {
  await importChat(page, {
    blob: await buildIosGroupZipWithImage(),
    name: 'WhatsApp Chat - Family.zip',
    self: 'Sara',
  });
  await page.getByRole('button', { name: 'Done' }).click();
  await page.getByRole('link', { name: /Family/u }).click();
  await page.getByRole('link', { name: 'Chat info' }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'Chat info' })).toBeVisible();
  await expect(page.getByText('Group chat')).toBeVisible();
  const history = page.getByRole('region', { name: 'Import history' });
  await expect(history.getByText(/WhatsApp Chat - Family\.zip/u)).toBeVisible();
  await expect(history.getByText(/added · 0 already there/u)).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Sara' })).toBeChecked();
  await expectAxeClean(page);

  // Settings → Storage lists the chat's stored media.
  await page.goto('/#/settings');
  const storage = page.getByRole('region', { name: 'Storage' });
  await expect(storage.getByRole('listitem').filter({ hasText: 'Family' })).toBeVisible();
  await expect(storage.getByText(/used of .* available/u)).toBeVisible();
  expect(await countOpfsMediaFiles(page)).toBe(1);

  // Delete from chat info: back to the list, files and usage gone.
  await page.goBack();
  await page.getByRole('button', { name: 'Delete chat' }).click();
  const confirm = page.getByRole('dialog', { name: 'Delete “Family”?' });
  await expect(confirm.getByText(/1 media files/u)).toBeVisible();
  await confirm.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByText('No chats yet')).toBeVisible();
  await expect.poll(async () => countOpfsMediaFiles(page)).toBe(0);

  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(
    page.getByRole('region', { name: 'Storage' }).getByText('No media stored.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Clean up orphaned files' }).click();
  await expect(page.getByText('No orphaned files.')).toBeVisible();
});

test('settings sections render and pass axe in both themes', async ({ page }) => {
  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeFocused();
  for (const name of ['Appearance', 'App lock', 'Storage', 'Diagnostics', 'About']) {
    await expect(page.getByRole('region', { name })).toBeVisible();
  }
  await expect(page.getByText('react 19.3.1 · MIT')).toBeAttached();
  await expect(
    page.getByRole('region', { name: 'Diagnostics' }).getByText('Available').first(),
  ).toBeVisible();
  await expectAxeClean(page);

  await page.getByRole('radio', { name: 'Dark' }).check();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expectAxeClean(page);

  // The choice survives a reload (applied before the first paint).
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('app lock: cover, lock, unlock, and backoff after failures', async ({ page }) => {
  await page.getByRole('link', { name: 'Settings' }).click();
  const lock = page.getByRole('region', { name: 'App lock' });
  await lock.getByLabel('New PIN (4–8 digits)').fill('2468');
  await lock.getByLabel('Repeat the new PIN').fill('2468');
  await lock.getByRole('button', { name: 'Turn on app lock' }).click();
  await expect(lock.getByText('App lock is on.')).toBeVisible();

  // With a delay, hiding raises only the privacy cover; it drops on return.
  await lock.getByRole('radio', { name: 'After 1 min' }).click();
  await expect(lock.getByRole('radio', { name: 'After 1 min' })).toBeChecked();
  // Saved once the choices are enabled again.
  await expect(lock.getByRole('radio', { name: 'After 1 min' })).toBeEnabled();
  await setVisibility(page, 'hidden');
  await expect(page.locator('#privacy-cover')).toBeVisible();
  await setVisibility(page, 'visible');
  await expect(page.locator('#privacy-cover')).toBeHidden();
  const lockHeading = page.getByRole('heading', { name: 'xyChat is locked' });
  await expect(lockHeading).toBeHidden();

  // Immediately: hiding locks at once, so the snapshot shows the lock screen.
  await lock.getByRole('radio', { name: 'Immediately' }).click();
  await expect(lock.getByRole('radio', { name: 'Immediately' })).toBeChecked();
  // Saved once the choices are enabled again.
  await expect(lock.getByRole('radio', { name: 'Immediately' })).toBeEnabled();
  await setVisibility(page, 'hidden');
  await expect(lockHeading).toBeVisible();
  await setVisibility(page, 'visible');
  await expect(lockHeading).toBeVisible();
  await expect(page.getByLabel('PIN')).toBeFocused();
  await expectAxeClean(page);

  await page.getByLabel('PIN').fill('2468');
  await page.getByRole('button', { name: 'Unlock' }).click();
  await expect(lockHeading).toBeHidden();
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();

  // Five wrong PINs start a 30 s lockout that survives a reload.
  await page.getByRole('button', { name: 'Lock now' }).click();
  await expect(lockHeading).toBeVisible();
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    await page.getByLabel('PIN').fill('0000');
    await page.getByRole('button', { name: 'Unlock' }).click();
    await expect(page.getByRole('alert')).toHaveText('Wrong PIN.');
    await expect(page.getByLabel('PIN')).toHaveValue('');
  }
  await page.getByLabel('PIN').fill('0000');
  await page.getByRole('button', { name: 'Unlock' }).click();
  await expect(page.getByRole('alert')).toContainText(/Try again in (30|29|28) s/u);
  await page.getByLabel('PIN').fill('2468');
  await expect(page.getByRole('button', { name: 'Unlock' })).toBeDisabled();

  await page.reload();
  await expect(lockHeading).toBeVisible({ timeout: 15_000 });
  await page.getByLabel('PIN').fill('2468');
  await expect(page.getByRole('alert')).toContainText(/Try again in \d+ s/u);
  await expect(page.getByRole('button', { name: 'Unlock' })).toBeDisabled();
});

test('the lock screen covers an open sheet and stays usable', async ({ page }) => {
  await importChat(page, {
    blob: await buildIosGroupZipWithImage(),
    name: 'WhatsApp Chat - Family.zip',
    self: 'Sara',
  });
  await page.getByRole('button', { name: 'Done' }).click();
  await page.getByRole('link', { name: 'Settings' }).click();
  const lock = page.getByRole('region', { name: 'App lock' });
  await lock.getByLabel('New PIN (4–8 digits)').fill('2468');
  await lock.getByLabel('Repeat the new PIN').fill('2468');
  await lock.getByRole('button', { name: 'Turn on app lock' }).click();
  await expect(lock.getByText('App lock is on.')).toBeVisible();

  await page.goBack();
  await page.getByRole('link', { name: /Family/u }).click();
  await page.getByRole('link', { name: 'Chat info' }).click();
  await page.getByRole('button', { name: 'Delete chat' }).click();
  const confirm = page.getByRole('dialog', { name: 'Delete “Family”?' });
  await expect(confirm).toBeVisible();

  await setVisibility(page, 'hidden');
  const lockHeading = page.getByRole('heading', { name: 'xyChat is locked' });
  await expect(lockHeading).toBeVisible();
  // The sheet must not paint over the lock screen (top layer order).
  const topmostIsLock = await page.evaluate(() => {
    const hit = document.elementFromPoint(window.innerWidth / 2, window.innerHeight - 20);
    return hit?.closest('dialog')?.textContent.includes('is locked') ?? false;
  });
  expect(topmostIsLock).toBe(true);
  await setVisibility(page, 'visible');

  // A real click proves the PIN field isn't covered or inert.
  await page.getByLabel('PIN').click();
  await page.keyboard.type('2468');
  await page.getByRole('button', { name: 'Unlock' }).click();
  await expect(lockHeading).toBeHidden();
  await expect(confirm).toBeVisible();
  await confirm.getByRole('button', { name: 'Close' }).click();
  await expect(confirm).toBeHidden();
});
