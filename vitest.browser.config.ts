import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

/**
 * Browser-mode integration tests (storage, workers) against the real
 * sqlite-wasm + OPFS stack, in WebKit and Chromium (AGENTS.md §19.1).
 * Tests arrive with milestone M2; until then the script runs with
 * --passWithNoTests.
 */
export default defineConfig({
  test: {
    include: ['tests/browser/**/*.test.ts'],
    browser: {
      enabled: true,
      provider: playwright(),
      headless: true,
      instances: [{ browser: 'chromium' as const }, { browser: 'webkit' as const }],
    },
  },
});
