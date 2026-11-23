/**
 * Media e2e (AGENTS.md §12.6, §13; §19.5 flows 8 and 9; §22 M6): the
 * gallery tabs, the image viewer with "Show in chat", the document and
 * links tabs, and voice-note playback on the engine's own decoder and on
 * the forced Opus fallback. Chromium runs the storage path; WebKit skips
 * (ADR 0007).
 */
import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { cspViolations, installCspListener } from './helpers/csp-violations';
import { expectBootOrUnsupported, skipWithoutOpfs } from './helpers/skip-without-opfs';
import { importChat } from './helpers/import-ui';
import { buildMediaZip, countCachedWavs } from './helpers/media-fixtures';

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

async function importAndOpenTrip(page: Page): Promise<void> {
  await importChat(page, { blob: await buildMediaZip(), name: 'WhatsApp Chat with Sara.zip' });
  await page.getByRole('button', { name: 'Open chat' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Sara' })).toBeVisible();
}

test('gallery → image viewer → Show in chat (flow 8)', async ({ page }) => {
  await importAndOpenTrip(page);
  // A photo bubble opens the viewer on that photo; closing returns focus.
  const bubblePhoto = page.getByRole('log').getByRole('button', { name: 'Open Photo' }).last();
  await bubblePhoto.click();
  await expect(page.getByRole('dialog', { name: 'Photo' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(bubblePhoto).toBeFocused();

  await page.getByRole('link', { name: 'Media, links and docs' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Media' })).toBeFocused();

  const tiles = page.getByRole('button', { name: /^Photo, /u });
  await expect(tiles).toHaveCount(2);
  await expect(page.getByRole('heading', { name: 'November 2026' })).toBeVisible();
  await expectAxeClean(page);

  // Newest first: Ali's photo, then Sara's.
  await tiles.first().click();
  const viewer = page.getByRole('dialog', { name: 'Photo 1 of 2' });
  await expect(viewer).toBeVisible();
  await expect(viewer).toContainText('Ali Khan');
  await expect(viewer.getByRole('img', { name: 'Photo' })).toBeVisible();
  await page.keyboard.press('ArrowRight');
  const second = page.getByRole('dialog', { name: 'Photo 2 of 2' });
  await expect(second).toContainText('Sara');
  await expectAxeClean(page);

  // Double-tap zooms in place; the image grows.
  const image = second.getByRole('img', { name: 'Photo' });
  const before = await image.boundingBox();
  await second.getByTestId('image-viewer-surface').dblclick({ delay: 20 });
  await expect
    .poll(async () => (await image.boundingBox())?.width ?? 0)
    .toBeGreaterThan(before?.width ?? 0);

  await second.getByRole('link', { name: 'Show in chat' }).click();
  await expect(page).toHaveURL(/#\/chat\/[0-9a-f-]+\?seq=1$/u);
  const row = page.getByRole('log').locator('article[aria-current="true"]');
  await expect(row).toContainText('the lake');
  await expect(row).toBeInViewport();
});

test('documents and links tabs (§12.6)', async ({ page }) => {
  await importAndOpenTrip(page);
  await page.getByRole('link', { name: 'Media, links and docs' }).click();

  await page.getByRole('link', { name: 'Documents' }).click();
  await expect(page).toHaveURL(/tab=docs$/u);
  await page.getByRole('button', { name: /^DOC-20261117-WA0004\.pdf Ali Khan/u }).click();
  const viewer = page.getByRole('dialog', { name: 'Document' });
  await expect(viewer).toContainText('DOC-20261117-WA0004.pdf');
  await expect(viewer.getByRole('button', { name: 'Open' })).toBeEnabled();
  await expect(viewer.getByRole('button', { name: 'Save' })).toBeEnabled();
  await expectAxeClean(page);
  await page.keyboard.press('Escape');
  await expect(viewer).toBeHidden();

  await page.getByRole('link', { name: 'Links' }).click();
  await expect(page.getByText('tickets.example.com', { exact: true })).toBeVisible();
  await expectAxeClean(page);
  await page.getByRole('link', { name: 'Show in chat' }).click();
  await expect(page).toHaveURL(/\?seq=5$/u);

  await page.getByRole('link', { name: 'Media, links and docs' }).click();
  await page.getByRole('link', { name: 'Videos' }).click();
  await expect(page.getByText('No videos in this chat.')).toBeVisible();
});

async function playVoiceNote(page: Page): Promise<void> {
  const log = page.getByRole('log');
  await log.getByRole('button', { name: 'Play Voice note' }).click();
  // Playing flips the control; the one-second note then ends on its own.
  await expect(log.getByRole('button', { name: 'Pause Voice note' })).toBeVisible({
    timeout: 20_000,
  });
  await expect(log.getByRole('button', { name: 'Play Voice note' })).toBeVisible({
    timeout: 10_000,
  });
  await expect(log.getByText(/^0:00 \/ 0:0[01]$/u)).toBeVisible();
}

test('a voice note plays in its bubble (flow 9)', async ({ page }) => {
  await importAndOpenTrip(page);
  await playVoiceNote(page);
  expect(await countCachedWavs(page)).toBe(0);
});

test('a voice note plays through the decoder fallback (flow 9, forced)', async ({ page }) => {
  // Pretend the engine can't play Ogg Opus, as on iOS before 17.4.
  await page.addInitScript(() => {
    const prototype = HTMLMediaElement.prototype;
    const original = Object.getOwnPropertyDescriptor(prototype, 'canPlayType')?.value as
      ((this: HTMLMediaElement, type: string) => CanPlayTypeResult) | undefined;
    Object.defineProperty(prototype, 'canPlayType', {
      configurable: true,
      value(this: HTMLMediaElement, type: string): CanPlayTypeResult {
        return type.includes('opus') ? '' : (original?.call(this, type) ?? '');
      },
    });
  });
  await page.reload();
  await importAndOpenTrip(page);
  await playVoiceNote(page);
  expect(await countCachedWavs(page)).toBe(1);
});
