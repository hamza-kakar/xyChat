import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

/**
 * Browser-mode integration tests (storage, workers) against the real
 * sqlite-wasm + OPFS stack (AGENTS.md §19.1). Tests arrive with milestone
 * M2; until then the script runs with --passWithNoTests.
 *
 * Coverage: @vitest/coverage-v8 supports browser mode only on Chromium
 * engines (vitest hard-throws on non-Chromium instances with v8), so the
 * Chromium project carries the §19.4 browser coverage and the WebKit project
 * runs without it. WebKit's own coverage question is left open in ADR 0007
 * for the owner's M2 decision — not silently weakened here.
 */
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'browser-chromium',
          include: ['tests/browser/**/*.test.ts'],
          coverage: {
            enabled: true,
            provider: 'v8',
            reporter: ['text', 'html', 'lcov'],
            reportsDirectory: 'coverage-browser-chromium',
            include: ['src/storage/**', 'src/workers/**', 'src/client/**'],
          },
          browser: {
            enabled: true,
            provider: playwright(),
            headless: true,
            instances: [{ browser: 'chromium' as const }],
          },
        },
      },
      {
        test: {
          name: 'browser-webkit',
          include: ['tests/browser/**/*.test.ts'],
          coverage: {
            enabled: false,
          },
          browser: {
            enabled: true,
            provider: playwright(),
            headless: true,
            instances: [{ browser: 'webkit' as const }],
          },
        },
      },
    ],
  },
});
