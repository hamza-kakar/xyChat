import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { cspViolations, installCspListener } from './helpers/csp-violations';
import { expectBootOrUnsupported } from './helpers/skip-without-opfs';

test.beforeEach(async ({ page }) => {
  await installCspListener(page);
});

test('app boots, or asserts the unsupported screen on incapable engines', async ({ page }) => {
  const booted = await expectBootOrUnsupported(page);
  if (booted) {
    await expect(page.getByText('Your chats, kept private on this device.')).toBeVisible();
  }
  await expect(cspViolations(page)).resolves.toEqual([]);
});

test('boot screen is axe-clean in light mode (home or unsupported)', async ({ page }) => {
  const booted = await expectBootOrUnsupported(page);
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
  await expect(cspViolations(page)).resolves.toEqual([]);
  // When the app booted, the dark-scheme override of the test below would
  // apply; here we additionally assert the visible palette is the light one.
  if (booted) {
    const surface = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--surface').trim(),
    );
    expect(surface).toBe('#f6f7f8');
  }
});

test('boot screen is axe-clean in dark mode (home or unsupported)', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  //  the dark palette must actually activate via prefers-color-scheme.
  const surface = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--surface').trim(),
  );
  expect(surface).toBe('#101413');
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
  await expect(cspViolations(page)).resolves.toEqual([]);
});

test('dark mode renders a different palette than light mode', async ({ page }) => {
  await page.goto('/');
  const lightSurface = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--surface').trim(),
  );
  await page.emulateMedia({ colorScheme: 'dark' });
  const darkSurface = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--surface').trim(),
  );
  expect(lightSurface).not.toBe(darkSurface);
});
