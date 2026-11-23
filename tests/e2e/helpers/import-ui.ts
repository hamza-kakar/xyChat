/**
 * Import UI steps shared by the e2e specs: open the picker past the
 * install gate, pick a file, and run a whole import to its report.
 */
import { expect, type Page } from '@playwright/test';

/** Navigates through the install gate to the picker (bypass). */
export async function openPicker(page: Page): Promise<void> {
  // The chat list renders after the async capability check + boot; with no
  // chats it shows the empty state's link, otherwise the toolbar's Import.
  const importLink = page
    .getByRole('link', { name: 'Import a chat' })
    .or(page.getByRole('link', { name: 'Import', exact: true }))
    .first();
  await expect(importLink).toBeVisible({ timeout: 30_000 });
  await importLink.click();
  const proceed = page.getByRole('button', { name: 'Continue' });
  const bypass = page.getByText('Continue anyway (not recommended)');
  const picker = page.getByText('Import a WhatsApp export');
  // The gate renders on non-standalone browsers until passed once.
  await proceed.or(bypass).or(picker).first().waitFor({ state: 'visible' });
  if (await bypass.isVisible()) {
    await bypass.click();
  }
  await expect(picker).toBeVisible();
}

/** Uploads a fixture blob through the file input. */
export async function pickFile(page: Page, blob: Blob, name: string): Promise<void> {
  const buffer = Buffer.from(await blob.arrayBuffer());
  const mimeType = name.endsWith('.txt') ? 'text/plain' : 'application/zip';
  await page.setInputFiles('input[type="file"]', { name, mimeType, buffer });
}

/** Runs a full import from the chat list to the report screen. */
export async function importChat(
  page: Page,
  input: {
    readonly blob: Blob;
    readonly name: string;
    readonly self?: string;
    readonly timeoutMs?: number;
  },
): Promise<void> {
  await openPicker(page);
  await pickFile(page, input.blob, input.name);
  await expect(page.getByText('Confirm import')).toBeVisible({ timeout: 30_000 });
  if (input.self !== undefined) {
    await page.getByRole('button', { name: input.self, exact: true }).first().click();
  }
  await page.getByRole('button', { name: 'Start import' }).click();
  await expect(page.getByText('Import complete')).toBeVisible({
    timeout: input.timeoutMs ?? 30_000,
  });
}
