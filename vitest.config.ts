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
          include: [
            'src/core/**/*.test.ts',
            'tests/fixtures/**/*.test.ts',
            'scripts/**/*.test.ts',
            'src/storage/*.test.ts',
            'src/storage/sqlite/*.test.ts',
            'src/client/*.test.ts',
            'src/workers/*.test.ts',
          ],
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
      // Worker coverage strategy (ADR 0007 addendum): the testable worker-side
      // logic lives in page modules — rpc-validate.ts (validation) and
      // rpc-call.ts (client timeout regime) — and is unit-tested here with
      // §19.4 thresholds. The worker entry shells (db.worker.ts,
      // import-api.ts, media-writer.ts) run only inside real worker
      // contexts, outside v8 instrumentation; they are exercised end-to-end
      // by every e2e flow (ADR 0007).
      include: [
        'src/core/**',
        'src/app/**',
        'src/platform/**',
        'src/workers/rpc-validate.ts',
        'src/workers/rpc-validate-media.ts',
        'src/workers/audio-transcode.ts',
        'src/client/rpc-call.ts',
        'src/storage/sqlite/opener.ts',
      ],
      // Type-only modules and re-export barrels contain no runtime code
      // (same convention as excluding *.d.ts).
      exclude: [
        'src/core/model/**',
        'src/core/parser/pattern-id.ts',
        'src/core/parser/locale/types.ts',
        'src/core/**/index.ts',
        // Non-TS artifacts and side-effect entry points: CSS carries no
        // executable lines; main.tsx (document + createRoot + SW register)
        // and vite-env.d.ts are exercised by every e2e flow (ADR 0007).
        '**/*.css',
        'src/app/main.tsx',
        'src/app/vite-env.d.ts',
      ],
      thresholds: {
        // AGENTS.md §19.4: core ≥ 95% lines, ≥ 90% branches.
        'src/core/**': { lines: 95, branches: 90 },
        'src/app/**': { lines: 70 },
        'src/workers/rpc-validate.ts': { lines: 85 },
        'src/client/rpc-call.ts': { lines: 85 },
        'src/storage/sqlite/opener.ts': { lines: 85 },
      },
    },
  },
});
