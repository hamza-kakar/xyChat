import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { cspViolations, installCspListener } from './helpers/csp-violations';
import { skipWithoutOpfs } from './helpers/skip-without-opfs';

test.beforeEach(async ({ page }) => {
  await installCspListener(page);
});

test('app boots to the home screen', async ({ page }) => {
  await skipWithoutOpfs(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'waChatBack' })).toBeVisible();
  await expect(cspViolations(page)).resolves.toEqual([]);
});

test('home screen is axe-clean in light mode', async ({ page }) => {
  await skipWithoutOpfs(page);
  await page.goto('/');
  // Scan only after the app has fully booted; axe on a mid-boot DOM
  // (capability check, skeleton) reports transient violations.
  await expect(page.getByRole('heading', { level: 1, name: 'waChatBack' })).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test('home screen is axe-clean in dark mode', async ({ page }) => {
  await skipWithoutOpfs(page);
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'waChatBack' })).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
  await expect(cspViolations(page)).resolves.toEqual([]);
});
