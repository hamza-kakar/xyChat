import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

/**
 * Browser-mode integration tests on Chromium. Tests arrive
 * with milestone M2. This project carries the browser coverage:
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
      // Worker coverage strategy (ADR 0007 addendum): page-context browser
      // tests measure the storage layer against the real sqlite-wasm stack.
      // opener.ts (Web Locks lifetime lock) is unit-tested with injected
      // fake lock managers in the node project (opener.test.ts); db.worker /
      // media-writer run only inside real worker contexts — both exercised
      // end-to-end (ADR 0007). rpc-validate / rpc-call carry their
      // thresholds in the unit project.
      include: ['src/storage/**'],
      exclude: ['src/storage/repository.ts', 'src/storage/sqlite/opener.ts', '**/*.test.ts'],
      //  storage ≥ 85% lines, CI-enforced.
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
