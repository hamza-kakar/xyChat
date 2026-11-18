import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

/**
 * Browser-mode integration tests on Chromium (AGENTS.md §19.1). Tests arrive
 * with milestone M2. This project carries the §19.4 browser coverage:
 * @vitest/coverage-v8 supports browser mode on Chromium engines only.
 */
export default defineConfig({
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
});
