/**
 * Accessibility sweep (AGENTS.md §16, §19.5 flow 16): every route is
 * axe-clean in the light and dark themes, raises no CSP violation, and
 * keeps its layout at double text size (Dynamic Type) without sideways
 * scrolling. One chat with media is imported first so the chat routes
 * have content. Chromium runs it; Linux WebKit skips (ADR 0007).
 */
import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { cspViolations, installCspListener } from './helpers/csp-violations';
import { expectBootOrUnsupported, skipWithoutOpfs } from './helpers/skip-without-opfs';
import { importChat } from './helpers/import-ui';
import { buildMediaZip } from './helpers/media-fixtures';

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

interface RouteCheck {
  readonly path: (chatPath: string) => string;
  readonly heading: string;
}

const ROUTES: readonly RouteCheck[] = [
  { path: () => '#/', heading: 'waChatBack' },
  { path: (chat) => chat, heading: 'Sara' },
  { path: (chat) => `${chat}/info`, heading: 'Chat info' },
  { path: (chat) => `${chat}/media?tab=photos`, heading: 'Media' },
  { path: (chat) => `${chat}/media?tab=audio`, heading: 'Media' },
  { path: (chat) => `${chat}/media?tab=docs`, heading: 'Media' },
  { path: (chat) => `${chat}/media?tab=links`, heading: 'Media' },
  { path: () => '#/search?q=trip', heading: 'Search' },
  { path: () => '#/bookmarks', heading: 'Bookmarks' },
  // The install gate shows until passed once; the import above passed it.
  { path: () => '#/import', heading: 'Import a WhatsApp export' },
  { path: () => '#/settings', heading: 'Settings' },
];

/** Imports the media chat and returns its `#/chat/<id>` path. */
async function importMediaChat(page: Page): Promise<string> {
  await importChat(page, { blob: await buildMediaZip(), name: 'WhatsApp Chat with Sara.zip' });
  await page.getByRole('button', { name: 'Open chat' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Sara' })).toBeVisible();
  return new URL(page.url()).hash;
}

async function openRoute(page: Page, route: RouteCheck, chatPath: string): Promise<void> {
  await page.goto(`./${route.path(chatPath)}`);
  await expect(page.getByRole('heading', { level: 1, name: route.heading })).toBeVisible({
    timeout: 30_000,
  });
}

test('every route is axe-clean in light and dark (§16)', async ({ page }) => {
  const chatPath = await importMediaChat(page);
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme });
    for (const route of ROUTES) {
      await openRoute(page, route, chatPath);
      const results = await new AxeBuilder({ page }).analyze();
      expect(
        results.violations.map((violation) => ({
          id: violation.id,
          targets: violation.nodes.map((node) => node.html.slice(0, 160)),
        })),
        `${route.path(chatPath)} (${colorScheme})`,
      ).toEqual([]);
    }
  }
});

test('every route keeps its layout at double text size (§16)', async ({ page }) => {
  const chatPath = await importMediaChat(page);
  for (const route of ROUTES) {
    await openRoute(page, route, chatPath);
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '200%';
    });
    // Elements past the viewport's end edge, except inside a strip that
    // scrolls sideways on purpose (the gallery tabs).
    const overflow = await page.evaluate(() => {
      const limit = document.documentElement.clientWidth;
      const inScroller = (element: Element): boolean => {
        for (let node = element.parentElement; node !== null; node = node.parentElement) {
          if (getComputedStyle(node).overflowX !== 'visible' && node !== document.body) {
            return true;
          }
        }
        return false;
      };
      return [...document.querySelectorAll('body *')]
        .filter((element) => element.getBoundingClientRect().right > limit + 1)
        .filter((element) => !inScroller(element))
        .map((element) => element.outerHTML.slice(0, 120));
    });
    expect(overflow, route.path(chatPath)).toEqual([]);
    await expect(page.getByRole('heading', { level: 1, name: route.heading })).toBeInViewport();
  }
});
