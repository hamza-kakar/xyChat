/**
 * Chat list and chat view e2e: rendering of an imported group, message actions,
 * rename and delete, the self banner, RTL direction, and the 100k-message
 * scroll budget. Chromium runs the storage path; WebKit skips (ADR 0007).
 */
import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { cspViolations, installCspListener } from './helpers/csp-violations';
import { expectBootOrUnsupported, skipWithoutOpfs } from './helpers/skip-without-opfs';
import { importChat } from './helpers/import-ui';
import { countOpfsMediaFiles } from './helpers/import-fixtures';
import { buildIosGroupZipWithImage, buildRtlZip, largeChatText } from './helpers/chat-fixtures';

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

async function importFamily(page: Page, self?: string): Promise<void> {
  await importChat(page, {
    blob: await buildIosGroupZipWithImage(),
    name: 'WhatsApp Chat - Family.zip',
    ...(self === undefined ? {} : { self }),
  });
}

test('chat list and chat view render an imported group', async ({ page }) => {
  await importFamily(page, 'Sara');
  await page.getByRole('button', { name: 'Done' }).click();

  // Chat list: title and a preview with sender prefix and media label.
  const row = page.getByRole('link', { name: /Family/u });
  await expect(row).toContainText('Ali Khan: Video');
  await expectAxeClean(page);
  await row.click();

  // Header and log.
  await expect(page.getByRole('heading', { level: 1, name: 'Family' })).toBeVisible();
  await expect(page.getByText('3 participants')).toBeVisible();
  const log = page.getByRole('log', { name: 'Messages in Family' });
  await expect(log.getByText('good evening all')).toBeVisible();

  // Day separator, sender name on incoming group bubbles, system pill.
  await expect(
    log
      .getByText(/^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Nov 17, 2026)$/u)
      .first(),
  ).toBeVisible();
  await expect(log.getByText('Bob', { exact: true }).first()).toBeVisible();
  await expect(log.getByText('Sara created group "Family"')).toBeVisible();

  // Media: the stored photo's thumbnail, the missing video, the omitted one.
  await expect(log.getByRole('img', { name: 'Photo' })).toBeVisible();
  await expect(log.getByText('Media file not found in archive')).toBeVisible();
  await expect(log.getByText('Media not included in export')).toBeVisible();

  // Sara is "me": her bubble sits at the inline end, Bob's at the start.
  const viewport = page.viewportSize();
  const mine = await log.getByText('welcome to the family chat').boundingBox();
  const theirs = await log.getByText('good evening all').boundingBox();
  expect(viewport).not.toBeNull();
  expect(mine).not.toBeNull();
  expect(theirs).not.toBeNull();
  if (viewport !== null && mine !== null && theirs !== null) {
    expect(mine.x + mine.width).toBeGreaterThan(viewport.width * 0.6);
    expect(theirs.x).toBeLessThan(viewport.width * 0.4);
  }

  // Each message has a spoken label and its position in the set.
  const article = log.locator('article', { hasText: 'good evening all' });
  await expect(article).toHaveAttribute(
    'aria-label',
    /^Bob, Nov 17, 2026, 9:20:00\s?PM: good evening all$/u,
  );
  await expect(article).toHaveAttribute('aria-setsize', '6');
  await expectAxeClean(page);

  await page.emulateMedia({ colorScheme: 'dark' });
  await expectAxeClean(page);
  await page.getByRole('link', { name: 'Back to chats' }).click();
  await expectAxeClean(page);
});

test('message actions: copy and message info', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await importFamily(page, 'Sara');
  await page.getByRole('button', { name: 'Open chat' }).click();
  const log = page.getByRole('log');
  await log.getByText('good evening all').click({ button: 'right' });

  const sheet = page.getByRole('dialog', { name: 'Message' });
  await expect(sheet).toBeVisible();
  await sheet.getByRole('button', { name: 'Copy text' }).click();
  await expect(sheet.getByRole('button', { name: 'Copied' })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('good evening all');

  await sheet.getByRole('button', { name: 'Message info' }).click();
  const info = page.getByRole('dialog', { name: 'Message info' });
  await expect(info).toContainText('Bob');
  await expect(info).toContainText('Text');
  await expect(info).toContainText('WhatsApp Chat - Family.zip');
  await expectAxeClean(page);
  await info.getByRole('button', { name: 'Close' }).click();
  await expect(info).toHaveCount(0);
});

test('rename and delete a chat from the list', async ({ page }) => {
  await importFamily(page);
  await page.getByRole('button', { name: 'Done' }).click();
  expect(await countOpfsMediaFiles(page)).toBe(1);

  await page.getByRole('button', { name: 'More actions for Family' }).click();
  await page.getByRole('button', { name: 'Rename' }).click();
  await page.getByLabel('Chat name').fill('Family archive');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('link', { name: /Family archive/u })).toBeVisible();

  await page.getByRole('button', { name: 'More actions for Family archive' }).click();
  await page.getByRole('button', { name: 'Delete chat' }).click();
  const confirm = page.getByRole('dialog', { name: 'Delete “Family archive”?' });
  await expect(confirm).toContainText('6 messages and 1 media files');
  await confirm.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByText('No chats yet')).toBeVisible();
  await expect.poll(async () => countOpfsMediaFiles(page)).toBe(0);
});

test('self banner: choosing who is me moves their bubbles', async ({ page }) => {
  await importFamily(page);
  await page.getByRole('button', { name: 'Open chat' }).click();
  await expect(page.getByText('Choose which person is you')).toBeVisible();
  await page.getByRole('button', { name: 'Choose', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Which one is you?' })
    .getByRole('button', { name: 'Bob' })
    .click();
  await expect(page.getByText('Choose which person is you')).toHaveCount(0);
  const viewport = page.viewportSize();
  const bob = await page.getByRole('log').getByText('good evening all').boundingBox();
  if (viewport !== null && bob !== null) {
    expect(bob.x + bob.width).toBeGreaterThan(viewport.width * 0.6);
  }
});

test('RTL messages take their direction from their content', async ({ page }) => {
  await importChat(page, { blob: await buildRtlZip(), name: 'WhatsApp Chat with علی.zip' });
  await page.getByRole('button', { name: 'Open chat' }).click();
  const log = page.getByRole('log');
  const urdu = log.locator('[dir="auto"]', { hasText: 'السلام علیکم' }).first();
  const english = log.locator('[dir="auto"]', { hasText: 'Hello! All good here.' }).first();
  await expect(urdu).toBeVisible();
  expect(await urdu.evaluate((element) => element.matches(':dir(rtl)'))).toBe(true);
  expect(await english.evaluate((element) => element.matches(':dir(ltr)'))).toBe(true);
  await expectAxeClean(page);
});

test('100k-message chat: opens fast, scrolls without long tasks, restores place', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const text = largeChatText(100_000);
  await importChat(page, {
    blob: new Blob([text], { type: 'text/plain' }),
    name: 'WhatsApp Chat with Big.txt',
    timeoutMs: 180_000,
  });
  await page.getByRole('button', { name: 'Done' }).click();
  const row = page.getByRole('link', { name: /Big/u });
  await expect(row).toBeVisible();

  //  first bubbles painted within 300 ms of opening (DB already ready).
  const openMs = await page.evaluate(async () => {
    const link = [...document.querySelectorAll('a')].find((a) => a.textContent.includes('Big'));
    if (link === undefined) {
      return Number.POSITIVE_INFINITY;
    }
    const start = performance.now();
    const painted = new Promise<number>((resolve) => {
      const observer = new MutationObserver(() => {
        if (document.querySelector('[role="log"] article:not([aria-busy])') !== null) {
          observer.disconnect();
          requestAnimationFrame(() => {
            resolve(performance.now() - start);
          });
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
    });
    link.click();
    return painted;
  });
  expect(openMs).toBeLessThanOrEqual(300);
  const log = page.getByRole('log');
  await expect(log.getByText('message 99999 with some ordinary words')).toBeVisible();

  //  a scripted fast scroll produces no long task over 50 ms.
  const longTasks = await page.evaluate(async () => {
    const durations: number[] = [];
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        durations.push(entry.duration);
      }
    });
    observer.observe({ type: 'longtask' });
    const scroller = document.querySelector('[role="log"]');
    for (let frame = 0; frame < 150 && scroller !== null; frame += 1) {
      scroller.scrollTop -= 1200;
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
    observer.disconnect();
    return durations;
  });
  expect(longTasks.filter((duration) => duration > 50)).toEqual([]);

  // Leaving and coming back restores the place.
  await expect(log.locator('article:not([aria-busy])').first()).toBeVisible();
  const topBefore = await log.locator('article[data-seq]').first().getAttribute('data-seq');
  await page.getByRole('link', { name: 'Back to chats' }).click();
  await page.getByRole('link', { name: /Big/u }).click();
  await expect(log.locator('article[data-seq]').first()).toBeVisible();
  const topAfter = await log.locator('article[data-seq]').first().getAttribute('data-seq');
  expect(Math.abs(Number(topAfter) - Number(topBefore))).toBeLessThanOrEqual(12);
});
