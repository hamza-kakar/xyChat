import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

/**
 * Unit + component test projects (AGENTS.md §19.1). Browser-mode tests have
 * their own config (vitest.browser.config.ts).
 */
export default defineConfig({
  // Mirrors the define in vite.config.ts so modules depending on the build
  // -time version load the same way under tests.
  define: {
    __APP_VERSION__: JSON.stringify(
      (
        JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
          version: string;
        }
      ).version,
    ),
  },
  test: {
    projects: [
      {
        test: {
          name: 'component',
          environment: 'happy-dom',
          include: ['src/app/**/*.test.ts', 'src/app/**/*.test.tsx', 'src/platform/**/*.test.ts'],
          setupFiles: ['src/app/test/setup.ts'],
        },
      },
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: 'coverage',
      include: ['src/app/**', 'src/platform/**'],
      thresholds: {
        // core (95/90) joins with M1; storage/workers thresholds with M2.
        'src/app/**': { lines: 70 },
      },
    },
  },
});
