import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
const BASE_PATH = process.env['E2E_BASE_PATH'] ?? '/xyChat/';
const BASE_URL = `http://localhost:${PORT}${BASE_PATH}`;

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: process.env['CI'] !== undefined,
  retries: process.env['CI'] !== undefined ? 1 : 0,
  // One worker on CI: parallel browser startup on 2-core runners makes
  // first-time OPFS initialization transiently fail (UnknownError).
  ...(process.env['CI'] !== undefined ? { workers: 1 } : {}),
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
  },
  webServer: {
    command: `pnpm preview --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: process.env['CI'] === undefined,
    timeout: 60_000,
  },
  projects: [
    {
      name: 'iphone-13-webkit',
      use: { ...devices['iPhone 13'] },
    },
    {
      name: 'pixel-7-chromium',
      use: { ...devices['Pixel 7'] },
    },
  ],
});
