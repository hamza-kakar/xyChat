import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

/**
 * Unit + component test projects (AGENTS.md §19.1). Browser-mode tests have
 * their own config (vitest.browser.config.ts). TZ coverage for `core` comes
 * from the CI matrix (UTC, Asia/Karachi, America/Los_Angeles).
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
          name: 'node',
          environment: 'node',
          include: ['src/core/**/*.test.ts', 'tests/fixtures/**/*.test.ts'],
        },
      },
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
      include: ['src/core/**', 'src/app/**', 'src/platform/**'],
      // Type-only modules and re-export barrels contain no runtime code
      // (same convention as excluding *.d.ts).
      exclude: [
        'src/core/model/**',
        'src/core/parser/pattern-id.ts',
        'src/core/parser/locale/types.ts',
        'src/core/**/index.ts',
      ],
      thresholds: {
        // AGENTS.md §19.4: core ≥ 95% lines, ≥ 90% branches.
        'src/core/**': { lines: 95, branches: 90 },
        'src/app/**': { lines: 70 },
      },
    },
  },
});
