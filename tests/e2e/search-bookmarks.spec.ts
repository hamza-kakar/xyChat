/**
 * Search, jump to date and bookmarks e2e (AGENTS.md §11, §12.5; §19.5
 * flows 6, 7 and 10; §22 M5). Chromium runs the storage path; WebKit
 * skips (ADR 0007).
 */
import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { cspViolations, installCspListener } from './helpers/csp-violations';
import { expectBootOrUnsupported, skipWithoutOpfs } from './helpers/skip-without-opfs';
import { importChat } from './helpers/import-ui';
import { buildIosGroupZipWithImage, searchChatText } from './helpers/chat-fixtures';

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

async function expectAxeCleanBothThemes(page: Page): Promise<void> {
  await page.emulateMedia({ colorScheme: 'light' });
  await expectAxeClean(page);
  await page.emulateMedia({ colorScheme: 'dark' });
  await expectAxeClean(page);
  await page.emulateMedia({ colorScheme: 'light' });
}

async function importPlans(page: Page): Promise<void> {
  await importChat(page, {
    blob: new Blob([searchChatText(2000)], { type: 'text/plain' }),
    name: 'WhatsApp Chat with Plans.txt',
    timeoutMs: 60_000,
  });
  await page.getByRole('button', { name: 'Done' }).click();
}

/** Safe-area insets sit on the header and its own spacing on the row
 * inside, so neither overrides the other (§12.1). */
async function expectHeaderSpacing(page: Page): Promise<void> {
  const header = page.locator('main header').first();
  await expect(header).toHaveCSS('padding-bottom', '0px');
  await expect(header.locator('> div')).toHaveCSS('padding-top', '4px');
  await expect(header.locator('> div')).toHaveCSS('padding-inline-start', '4px');
}

/** The message row currently marked as jumped-to. */
function highlightedRow(page: Page) {
  return page.getByRole('log').locator('article[aria-current="true"]');
}

test('global search opens the hit in its chat, highlighted (flow 6)', async ({ page }) => {
  await importPlans(page);
  await page.getByRole('link', { name: 'Search all chats' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Search' })).toBeFocused();
  await expectHeaderSpacing(page);
  await page.getByRole('searchbox', { name: 'Search messages' }).fill('number 1250');
  const hit = page.getByRole('link', { name: /^Plans.*Sara.*trip idea number 1250/u });
  await expect(hit).toBeVisible();
  await expect(hit.locator('mark')).toHaveText('number 1250');
  await expect(page).toHaveURL(/#\/search\?q=number\+1250$/u);
  await expectAxeCleanBothThemes(page);

  await hit.click();
  await expect(page.getByRole('heading', { level: 1, name: 'Plans' })).toBeVisible();
  const row = highlightedRow(page);
  await expect(row).toContainText('trip idea number 1250');
  await expect(row).toBeInViewport();
  // The highlight is brief.
  await expect(highlightedRow(page)).toHaveCount(0, { timeout: 5_000 });

  // Short queries across all chats ask for more characters.
  await page.goto('./#/search?q=tr');
  await expect(page.getByText('Type at least 3 characters to search all chats.')).toBeVisible();
});

test('in-chat search steps through matches; jump to date and to latest (flow 7)', async ({
  page,
}) => {
  await importPlans(page);
  await page.getByRole('link', { name: /Plans/u }).click();
  const log = page.getByRole('log');
  await expect(log.getByText('note 1999 about the weekly plan')).toBeVisible();
  await expectHeaderSpacing(page);

  await page.getByRole('button', { name: 'Search in chat' }).click();
  await page.getByRole('searchbox', { name: 'Search in this chat' }).fill('trip idea');
  await expect(page.getByText('8 of 8')).toBeVisible();
  await expect(highlightedRow(page)).toContainText('trip idea number 1750');
  await page.getByRole('button', { name: 'Previous match (older)' }).click();
  await expect(page.getByText('7 of 8')).toBeVisible();
  await expect(highlightedRow(page)).toContainText('trip idea number 1500');
  await expect(highlightedRow(page)).toBeInViewport();
  await page.getByRole('button', { name: 'Next match (newer)' }).click();
  await expect(page.getByText('8 of 8')).toBeVisible();
  await expectAxeCleanBothThemes(page);
  await page.getByRole('button', { name: 'Close search' }).click();

  await page.getByRole('button', { name: 'Jump to date' }).click();
  const sheet = page.getByRole('dialog', { name: 'Jump to date' });
  await expect(sheet.getByText('January 2025')).toBeVisible();
  await expectAxeCleanBothThemes(page);
  await sheet.getByRole('button', { name: /January 14, 2025, has messages$/u }).click();
  await expect(sheet).toHaveCount(0);
  await expect(highlightedRow(page)).toContainText('note 400 about the weekly plan');
  await expect(highlightedRow(page)).toBeInViewport();

  const latest = page.getByRole('button', { name: /^Jump to the latest message, \d+ below$/u });
  await expect(latest).toBeVisible();
  await latest.click();
  await expect(log.getByText('note 1999 about the weekly plan')).toBeInViewport();
  await expect(latest).toHaveCount(0);

  await page.getByRole('button', { name: 'Jump to date' }).click();
  await page.getByRole('button', { name: 'First message' }).click();
  await expect(log.getByText('trip idea number 0', { exact: true })).toBeInViewport();

  // A `?q=` link opens the chat with the search filled in and lands on the
  // newest match, even though the chat itself opens at its last message.
  const chatPath = new URL(page.url()).hash.replace(/\?.*$/u, '');
  await page.goto('./');
  await page.goto(`./${chatPath}?q=number%20250`);
  await expect(page.getByRole('searchbox', { name: 'Search in this chat' })).toHaveValue(
    'number 250',
  );
  await expect(page.getByText('1 of 1')).toBeVisible();
  await expect(highlightedRow(page)).toContainText('trip idea number 250');
  await expect(highlightedRow(page)).toBeInViewport();
  await expect(page.getByRole('heading', { level: 1, name: 'Plans' })).toBeFocused();
});

test('bookmark a message, edit its note, find it and remove it (flow 10)', async ({ page }) => {
  await importChat(page, {
    blob: await buildIosGroupZipWithImage(),
    name: 'WhatsApp Chat - Family.zip',
    self: 'Sara',
  });
  await page.getByRole('button', { name: 'Open chat' }).click();
  const log = page.getByRole('log');
  await log.getByText('good evening all').click({ button: 'right' });
  await page
    .getByRole('dialog', { name: 'Message' })
    .getByRole('button', { name: 'Bookmark' })
    .click();
  const article = log.locator('article', { hasText: 'good evening all' });
  await expect(article).toHaveAttribute('aria-label', /, Bookmarked$/u);

  await log.getByText('good evening all').click({ button: 'right' });
  await page.getByRole('button', { name: 'Edit bookmark note' }).click();
  const noteSheet = page.getByRole('dialog', { name: 'Bookmark note' });
  await noteSheet.getByRole('textbox', { name: 'Note (optional)' }).fill('Bob says hi');
  await expectAxeClean(page);
  await noteSheet.getByRole('button', { name: 'Save' }).click();
  await expect(noteSheet).toHaveCount(0);

  await page.goto('./#/bookmarks');
  await expect(page.getByRole('heading', { level: 1, name: 'Bookmarks' })).toBeFocused();
  const item = page.getByRole('listitem').filter({ hasText: 'good evening all' });
  await expect(item).toContainText('Family');
  await expect(item).toContainText('Bob says hi');
  await expectAxeCleanBothThemes(page);

  await item.getByRole('link', { name: 'Show in chat' }).click();
  await expect(highlightedRow(page)).toContainText('good evening all');

  await page.goto('./#/bookmarks');
  await page
    .getByRole('listitem')
    .filter({ hasText: 'good evening all' })
    .getByRole('button', { name: /^Remove bookmark: / })
    .click();
  await expect(page.getByText('No bookmarks yet')).toBeVisible();
  await expectAxeClean(page);
});
