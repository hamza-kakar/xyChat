/**
 * Backup and restore e2e (AGENTS.md §10.6; §19.5 flow 13; §22 M8): back
 * up a chat, delete it, restore it, and compare message count and
 * fingerprints through a second backup. Chromium runs the storage path;
 * WebKit skips (ADR 0007).
 */
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import * as zipJs from '@zip.js/zip.js';
import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { cspViolations, installCspListener } from './helpers/csp-violations';
import { expectBootOrUnsupported, skipWithoutOpfs } from './helpers/skip-without-opfs';
import { importChat } from './helpers/import-ui';
import { countOpfsMediaFiles } from './helpers/import-fixtures';
import { buildIosGroupZipWithImage } from './helpers/chat-fixtures';

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

/** What a backup's database holds, read in Node. */
interface BackupContents {
  readonly entries: readonly string[];
  readonly fingerprints: readonly string[];
}

/** Opens a downloaded backup and reads the message fingerprints in order. */
async function readBackup(path: string): Promise<BackupContents> {
  const reader = new zipJs.ZipReader(new zipJs.BlobReader(new Blob([await readFile(path)])));
  const entries = await reader.getEntries();
  const database = entries.find(
    (entry): entry is zipJs.FileEntry => entry.filename === 'db.sqlite3' && !entry.directory,
  );
  if (database === undefined) {
    throw new Error('backup has no database');
  }
  const bytes = await database.getData(new zipJs.Uint8ArrayWriter());
  await reader.close();
  const file = join(await mkdtemp(join(tmpdir(), 'backup-')), 'db.sqlite3');
  await writeFile(file, bytes);
  const db = new DatabaseSync(file, { readOnly: true });
  const rows = db.prepare('SELECT fingerprint FROM messages ORDER BY seq').all();
  db.close();
  return {
    entries: entries.map((entry) => entry.filename),
    fingerprints: rows.map((row) => String(row['fingerprint'])),
  };
}

/** A saved backup: where Playwright stored it and its file name. */
interface SavedBackup {
  readonly path: string;
  readonly name: string;
}

/** Makes a backup of every chat with media and saves it. */
async function makeBackup(page: Page): Promise<SavedBackup> {
  const section = page.getByRole('region', { name: 'Backup and restore' });
  await expect(section.getByText(/^About /u)).toBeVisible();
  await section.getByRole('button', { name: 'Make backup' }).click();
  await expect(section.getByText(/Backup ready: xychat-backup-\d{8}-\d{4}\.zip/u)).toBeVisible({
    timeout: 30_000,
  });
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    section.getByRole('button', { name: 'Save backup' }).click(),
  ]);
  const name = download.suggestedFilename();
  expect(name).toMatch(/^xychat-backup-\d{8}-\d{4}\.zip$/u);
  return { path: await download.path(), name };
}

test('back up a chat, delete it, and restore it identically (flow 13)', async ({ page }) => {
  await importChat(page, {
    blob: await buildIosGroupZipWithImage(),
    name: 'WhatsApp Chat - Family.zip',
    self: 'Sara',
  });
  await page.getByRole('button', { name: 'Done' }).click();

  await page.goto('/#/settings');
  const saved = await makeBackup(page);
  const first = await readBackup(saved.path);
  expect(first.fingerprints.length).toBeGreaterThan(0);
  expect(first.entries.slice(0, 2)).toEqual(['manifest.json', 'db.sqlite3']);
  expect(first.entries.some((name) => name.startsWith('media/'))).toBe(true);
  await expect(new AxeBuilder({ page }).analyze()).resolves.toMatchObject({ violations: [] });

  // Delete the chat: its messages and media are gone.
  await page.goto('/#/');
  await page.getByRole('link', { name: /Family/u }).click();
  await page.getByRole('link', { name: 'Chat info' }).click();
  await page.getByRole('button', { name: 'Delete chat' }).click();
  await page
    .getByRole('dialog', { name: 'Delete “Family”?' })
    .getByRole('button', { name: 'Delete', exact: true })
    .click();
  await expect(page.getByText('No chats yet')).toBeVisible();
  await expect.poll(async () => countOpfsMediaFiles(page)).toBe(0);

  // Restore it from the saved backup.
  await page.goto('/#/settings');
  const section = page.getByRole('region', { name: 'Backup and restore' });
  await section.getByLabel('Choose a backup file').setInputFiles({
    name: saved.name,
    mimeType: 'application/zip',
    buffer: await readFile(saved.path),
  });
  const family = section.getByRole('group', { name: 'Family' });
  await expect(family.getByRole('radio', { name: 'Restore' })).toBeChecked();
  await expect(new AxeBuilder({ page }).analyze()).resolves.toMatchObject({ violations: [] });
  await section.getByRole('button', { name: 'Restore', exact: true }).click();
  await expect(section.getByText('Restored 1 chat.')).toBeVisible({ timeout: 30_000 });
  await expect(section.getByText(/Family: \d+ added, 0 already there/u)).toBeVisible();
  await expect.poll(async () => countOpfsMediaFiles(page)).toBe(1);

  // A second backup holds the same messages with the same fingerprints.
  const second = await readBackup((await makeBackup(page)).path);
  expect(second.fingerprints).toEqual(first.fingerprints);

  // The restored chat opens with "me" still chosen.
  await section.getByRole('link', { name: 'Open chat' }).first().click();
  await page.getByRole('link', { name: 'Chat info' }).click();
  await expect(page.getByRole('radio', { name: 'Sara' })).toBeChecked();
});
