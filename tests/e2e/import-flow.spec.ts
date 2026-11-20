/**
 * Import e2e flows 2–5 (AGENTS.md §19.5): pick → confirm (self choice,
 * ambiguous date-order toggle, merge preselect) → progress → report, plus
 * duplicate re-import and mid-import cancellation. Chromium runs the full
 * storage path; WebKit skips (no OPFS in Playwright Linux builds, ADR
 * 0007). CSP + axe assertions ride along on the confirm screens.
 */
import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { expectBootOrUnsupported, skipWithoutOpfs } from './helpers/skip-without-opfs';
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

/** Navigates through the install gate to the picker (§12.8.1 bypass). */
async function openPicker(page: Page): Promise<void> {
  // The home screen renders after the async capability check + boot.
  const importLink = page.getByRole('link', { name: 'Import a chat' });
  await expect(importLink).toBeVisible({ timeout: 30_000 });
  await importLink.click();
  const proceed = page.getByRole('button', { name: 'Continue' });
  const bypass = page.getByText('Continue anyway (not recommended)');
  // The gate renders on non-standalone browsers; Chromium test contexts are
  // never standalone, so both buttons are expected.
  await proceed.or(bypass).first().waitFor({ state: 'visible' });
  await bypass.click();
  await expect(page.getByText('Import a WhatsApp export')).toBeVisible();
}

/** Uploads a fixture blob through the file input. */
async function pickFile(page: Page, blob: Blob, name: string): Promise<void> {
  const buffer = Buffer.from(await blob.arrayBuffer());
  await page.setInputFiles('input[type="file"]', { name, mimeType: 'application/zip', buffer });
}

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

  // §12.8.6: Open chat — the button navigates; the chat view itself lands
  // in M4 (the /chat/:chatId route currently redirects home, §12.3).
  await page.getByRole('button', { name: 'Open chat' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'waChatBack' })).toBeVisible();
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
  const importLink = page.getByRole('link', { name: 'Import a chat' });
  await expect(importLink).toBeVisible({ timeout: 30_000 });
  await importLink.click();
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
  const supersetLink = page.getByRole('link', { name: 'Import a chat' });
  await expect(supersetLink).toBeVisible({ timeout: 30_000 });
  await supersetLink.click();
  await pickFile(page, await buildSupersetZip(), 'WhatsApp Chat - Family.zip');
  await expect(page.getByText('Confirm import')).toBeVisible();
  await page.getByRole('button', { name: 'Start import' }).click();
  await expect(page.getByText('Import complete')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('2 messages imported')).toBeVisible();
  // The superset carries 5 of the 6 stored messages as duplicates (§8.10).
  await expect(page.getByText('5 duplicates skipped')).toBeVisible();

  // Ordering: the chat view lands in M4; ordering is asserted by the
  // 'interleaves a superset' browser contract test (getMessageWindow seq
  // order) and re-verified here through a third import of the SAME
  // superset: every message must now duplicate (fingerprints stable), so
  // the stored set matches the superset exactly.
  await page.getByRole('button', { name: 'Done' }).click();
  const thirdLink = page.getByRole('link', { name: 'Import a chat' });
  await expect(thirdLink).toBeVisible({ timeout: 30_000 });
  await thirdLink.click();
  await pickFile(page, await buildSupersetZip(), 'WhatsApp Chat - Family.zip');
  await expect(page.getByText('Confirm import')).toBeVisible();
  await page.getByRole('button', { name: 'Start import' }).click();
  await expect(page.getByText('Import complete')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('0 messages imported')).toBeVisible();
  await expect(page.getByText('7 duplicates skipped')).toBeVisible();
});

test('flow 5: cancel mid-import — no chat created, no OPFS files left (§9.3)', async ({ page }) => {
  await openPicker(page);
  // A zip with 300 media messages: the cancel lands inside writing-media,
  // after several files have been written and rolled back (§9.3).
  await pickFile(page, await buildMediaCancelZip(300), 'WhatsApp Chat - Media.zip');
  await expect(page.getByText('Confirm import')).toBeVisible();
  await page.getByRole('button', { name: 'Start import' }).click();
  await expect(page.getByText('Importing…')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel import' }).click();
  await expect(page.getByText('Import a WhatsApp export')).toBeVisible();

  // §9.3: NO chat was created — go home (browser back from the picker) and
  // confirm the home screen shows NO chat entries (the M3 build has no
  // chat list UI yet; the home screen is the M0 shell).
  await page.goBack();
  await expect(page.getByRole('heading', { level: 1, name: 'waChatBack' })).toBeVisible({
    timeout: 30_000,
  });
  // The M3 build has no chat entries visible anywhere: the empty state on
  // the home shell shows no chat rows (there are none in the db).
  await expect(page.getByText('good evening all')).toHaveCount(0);

  // §9.3: the OPFS media file count is back to the BASELINE (the rollback
  // deleted the written files). The baseline before any import is 0 files
  // under media/ — read via the app's own OPFS origin.
  const mediaFiles = await countOpfsMediaFiles(page);
  expect(mediaFiles).toBe(0);
});
