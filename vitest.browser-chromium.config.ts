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
    include: ['tests/browser-chromium/**/*.test.ts'],
    coverage: {
      enabled: true,
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: 'coverage-browser-chromium',
      // Worker runtime code (db.worker) runs outside the instrumented page
      // context; it is exercised via the db.worker contract flow and e2e.
      include: ['src/storage/**', 'src/client/**'],
      exclude: ['src/storage/repository.ts'],
      // §19.4: storage + workers ≥ 85% lines, CI-enforced (audit blocker 4).
      thresholds: {
        'src/storage/**': { lines: 85 },
      },
    },
    browser: {
      enabled: true,
      provider: playwright(),
      headless: true,
      instances: [{ browser: 'chromium' as const }],
    },
  },
});
