import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

/**
 * Browser-mode integration tests on WebKit (AGENTS.md §19.1). Tests arrive
 * with milestone M2. No coverage: @vitest/coverage-v8 rejects non-Chromium
 * browser instances; the WebKit coverage mechanism is an open question left
 * to the owner in ADR 0007 (§19.4 browser thresholds on WebKit and Chromium).
 */
export default defineConfig({
  test: {
    name: 'browser-webkit',
    // Storage contract tests live under tests/browser-chromium/ (Chromium-
    // only for M2 per the ADR 0007 addendum: CI WebKit still fails
    // installOpfsSAHPoolVfs with SecurityError post-#18235).
    include: ['tests/browser/**/*.test.ts'],
    browser: {
      enabled: true,
      provider: playwright(),
      headless: true,
      instances: [{ browser: 'webkit' as const }],
    },
  },
});
