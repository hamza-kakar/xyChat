/**
 * PWA installability gate (ADR 0009). Lighthouse 12 removed the PWA
 * category, so installability is enforced here: the built manifest is
 * validated against a schema, its icons must resolve, and the
 * apple-touch-icon link must exist. No OPFS involved — runs on every engine.
 */
import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import * as v from 'valibot';

const ManifestSchema = v.object({
  name: v.pipe(v.string(), v.nonEmpty()),
  short_name: v.pipe(v.string(), v.nonEmpty()),
  start_url: v.string(),
  scope: v.string(),
  display: v.picklist(['standalone', 'fullscreen', 'minimal-ui']),
  background_color: v.string(),
  theme_color: v.string(),
  icons: v.pipe(
    v.array(
      v.object({
        src: v.string(),
        sizes: v.string(),
        type: v.string(),
        purpose: v.optional(v.string()),
      }),
    ),
    v.check((icons) => icons.some((i) => i.sizes.includes('192')), '192px icon required'),
    v.check((icons) => icons.some((i) => i.sizes.includes('512')), '512px icon required'),
    v.check(
      (icons) => icons.some((i) => i.purpose?.includes('maskable') === true),
      'maskable icon required',
    ),
  ),
});

test('manifest validates and all icons resolve', async ({ page, request }) => {
  await page.goto('/');
  const origin = new URL(page.url()).origin;
  const response = await request.get(`${origin}/xychat/manifest.webmanifest`);
  expect(response.status()).toBe(200);
  const manifest: unknown = await response.json();
  const parsed = v.safeParse(ManifestSchema, manifest);
  expect(parsed.success, JSON.stringify(parsed.issues ?? [])).toBe(true);

  if (parsed.success) {
    for (const icon of parsed.output.icons) {
      const iconResponse = await request.get(`${origin}/xychat/${icon.src}`);
      expect(iconResponse.status(), icon.src).toBe(200);
      expect(iconResponse.headers()['content-type'] ?? '').toMatch(/image\//u);
    }
  }
});

test('apple-touch-icon link resolves', async ({ page }) => {
  await page.goto('/');
  const href = await page.locator('link[rel="apple-touch-icon"]').getAttribute('href');
  expect(href, 'apple-touch-icon href present').toBeTruthy();
  // page.request resolves relative URLs against the configured baseURL.
  const response = await page.request.get(href ?? '');
  expect(response.status(), `resolved ${String(href)}`).toBe(200);
});

test('manifest name matches the APP_NAME constant', async ({ page, request }) => {
  await page.goto('/');
  const response = await request.get(
    `${new URL(page.url()).origin}/xychat/manifest.webmanifest`,
  );
  const manifest = (await response.json()) as { name?: string; short_name?: string };
  // APP_NAME lives in src/app/app-name.ts; read it from source for the check.
  const source = readFileSync('src/app/app-name.ts', 'utf8');
  const expected = /APP_NAME = '([^']+)'/.exec(source)?.[1];
  expect(manifest.name).toBe(expected);
  expect(manifest.short_name).toBe(expected);
});
