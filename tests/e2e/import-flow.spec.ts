/**
 * Import e2e flows 2–5 (AGENTS.md §19.5): pick → confirm (self choice,
 * ambiguous date-order toggle, merge preselect) → progress → report, plus
 * duplicate re-import and mid-import cancellation. Chromium runs the full
 * storage path; WebKit skips (no OPFS in Playwright Linux builds, ADR
 * 0007). CSP + axe assertions ride along on the confirm screens.
 */
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { expectBootOrUnsupported, skipWithoutOpfs } from './helpers/skip-without-opfs';
import { openPicker, pickFile } from './helpers/import-ui';
import {
  buildAmbiguousZip,
  buildIosGroupZip,
  buildSupersetZip,
  buildMediaCancelZip,
  countOpfsMediaFiles,
} from './helpers/import-fixtures';

// Serial: parallel first-time OPFS initialization transiencely fails
// (playwright.config.ts forces 1 worker on CI for the same reason).
test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ page }) => {
  const booted = await expectBootOrUnsupported(page);
  await skipWithoutOpfs.call(undefined, page);
  // The flows below drive the real pipeline — they need a booted app with
  // storage (Chromium; WebKit skips per ADR 0007).
  test.skip(!booted, 'Engine not supported; storage flows run on Chromium.');
});

test('flow 2: import an iOS group zip — confirm, self choice, report', async ({ page }) => {
  await openPicker(page);
  await pickFile(page, await buildIosGroupZip(), 'WhatsApp Chat - Family.zip');

  // Confirm screen (§12.8.4): unambiguous DMY (days 17 > 12) → no toggle.
  await expect(page.getByText('Confirm import')).toBeVisible();
  await expect(page.getByText('Day / Month')).toHaveCount(0);
  await expect(page.getByLabel('Chat name')).toHaveValue('Family');
  await expect(page.getByText('1 referenced media files are not in the archive')).toBeVisible();
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations).toEqual([]);

  // Self choice + start (§12.8.4).
  await page.getByRole('button', { name: 'Sara' }).first().click();
  await page.getByRole('button', { name: 'Start import' }).click();

  // Report (§12.8.6): 6 messages, 2 media rows (1 present + 1 missing).
  await expect(page.getByText('Import complete')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('6 messages imported')).toBeVisible();
  await expect(page.getByText('1 media files stored')).toBeVisible();
  await expect(page.getByText('1 media files missing from the archive')).toBeVisible();

  // §12.8.6: Open chat lands in the chat view (§12.5).
  await page.getByRole('button', { name: 'Open chat' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Family' })).toBeVisible();
  await expect(page.getByRole('log').getByText('welcome to the family chat')).toBeVisible();
});

test('flow 3: ambiguous date order — toggle re-runs detection and preview updates', async ({
  page,
}) => {
  await openPicker(page);
  await pickFile(page, await buildAmbiguousZip(), 'WhatsApp Chat - MayJune.zip');

  await expect(page.getByText('Confirm import')).toBeVisible();
  // locale-hint (en-US) suggests MDY for 05/06/2026 — ambiguous → toggle.
  await expect(page.getByText('Day / Month')).toBeVisible();
  await expect(page.getByText('Month / Day')).toBeVisible();
  const preview = page.getByRole('region', { name: 'First messages (preview)' });
  await expect(preview).toContainText('may sixth in mdy');

  // Flip to DMY: 05/06 becomes 5 June — the same rendered day-labels but
  // the re-detection round-trips; assert the toggle state flips visually.
  await page.getByRole('button', { name: 'Day / Month' }).click();
  await expect(page.getByRole('button', { name: 'Day / Month' })).toHaveClass(/bg-accent/u);
  await expect(preview).toContainText('june fifth in dmy');
});

test('flow 4: re-importing the same file adds 0 and preselects the merge', async ({ page }) => {
  await openPicker(page);
  const zip = await buildIosGroupZip();
  await pickFile(page, zip, 'WhatsApp Chat - Family.zip');
  await expect(page.getByText('Confirm import')).toBeVisible();
  await page.getByRole('button', { name: 'Start import' }).click();
  await expect(page.getByText('Import complete')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('6 messages imported')).toBeVisible();

  // Second run: the title-match suggestion preselects "update existing".
  await page.getByRole('button', { name: 'Done' }).click();
  await openPicker(page);
  await pickFile(page, zip, 'WhatsApp Chat - Family.zip');
  await expect(page.getByText('Confirm import')).toBeVisible();
  await expect(page.getByText('Update existing chat: Family')).toBeVisible();
  await page.getByRole('button', { name: 'Start import' }).click();
  await expect(page.getByText('Import complete')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('0 messages imported')).toBeVisible();
  await expect(page.getByText('6 duplicates skipped')).toBeVisible();

  // §19.5 flow 4, second half: a NEWER SUPERSET (the same 6 messages plus 2
  // newer ones) adds only the new messages, in order.
  await page.getByRole('button', { name: 'Done' }).click();
  await openPicker(page);
  await pickFile(page, await buildSupersetZip(), 'WhatsApp Chat - Family.zip');
  await expect(page.getByText('Confirm import')).toBeVisible();
  await page.getByRole('button', { name: 'Start import' }).click();
  await expect(page.getByText('Import complete')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('2 messages imported')).toBeVisible();
  await expect(page.getByText('6 duplicates skipped')).toBeVisible();

  // The merged chat reads in file order: the interleaved message sits
  // between base messages 2 and 3 (§8.10).
  await page.getByRole('button', { name: 'Open chat' }).click();
  const log = page.getByRole('log');
  await expect(log.getByText('newer message at the end')).toBeVisible();
  const bodies = await log.locator('article').allTextContents();
  const order = ['created group', 'newer message inserted after base 1', 'good evening all'].map(
    (needle) => bodies.findIndex((text) => text.includes(needle)),
  );
  expect(order.every((index) => index >= 0)).toBe(true);
  expect([...order].sort((a, b) => a - b)).toEqual(order);
  await page.getByRole('link', { name: 'Back to chats' }).click();

  // Re-importing the superset adds nothing: all 8 are now stored.
  await openPicker(page);
  await pickFile(page, await buildSupersetZip(), 'WhatsApp Chat - Family.zip');
  await expect(page.getByText('Confirm import')).toBeVisible();
  await page.getByRole('button', { name: 'Start import' }).click();
  await expect(page.getByText('Import complete')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('0 messages imported')).toBeVisible();
  await expect(page.getByText('8 duplicates skipped')).toBeVisible();
});

test('flow 5: cancel mid-import — no chat created, no OPFS files left (§9.3)', async ({ page }) => {
  await openPicker(page);
  // Enough media that the cancel lands inside the media phase, after some
  // files are on disk: rollback must then delete them (§9.3).
  const zip = await buildMediaCancelZip(800);
  await pickFile(page, zip, 'WhatsApp Chat - Media.zip');
  await expect(page.getByText('Confirm import')).toBeVisible();
  await page.getByRole('button', { name: 'Start import' }).click();
  // The bar is named after the active phase. Wait until media files are
  // actually being written (the step list always shows every label).
  const mediaBar = page.getByRole('progressbar', {
    name: /^(Writing media|Generating thumbnails)$/u,
  });
  await expect
    .poll(async () => Number((await mediaBar.getAttribute('aria-valuenow')) ?? 0), {
      timeout: 30_000,
      intervals: [25],
    })
    .toBeGreaterThanOrEqual(2);
  expect(await countOpfsMediaFiles(page)).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Cancel import' }).click();
  await expect(page.getByText('Import cancelled. Nothing was imported.')).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole('button', { name: 'Try another file' }).click();
  await expect(page.getByText('Import a WhatsApp export')).toBeVisible();

  // §9.3: no chat was created. Picking the same export again must not offer
  // to update an existing "Media" chat; flow 4 shows that option appearing
  // once a chat with the title exists.
  await pickFile(page, zip, 'WhatsApp Chat - Media.zip');
  await expect(page.getByText('Confirm import')).toBeVisible();
  // The target choice renders with the detection result, in the same paint
  // as the heading, so its absence here is final.
  await expect(page.getByText('Update existing chat: Media')).toHaveCount(0);

  // §9.3: the OPFS media file count returns to the
  // BASELINE (0) — poll until the async rollback deletes everything.
  await expect
    .poll(async () => countOpfsMediaFiles(page), { timeout: 30_000, intervals: [250, 500] })
    .toBe(0);
});
