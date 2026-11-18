import js from '@eslint/js';
import eslintComments from '@eslint-community/eslint-plugin-eslint-comments';
import importX from 'eslint-plugin-import-x';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'coverage/**',
      'coverage-browser-chromium/**',
      'node_modules/**',
      'playwright-report/**',
      'test-results/**',
      'lighthouse-reports/**',
      '.lighthouseci/**',
      'public/**',
      // Declarative JS configs, not covered by a TS project.
      '.dependency-cruiser.cjs',
      'eslint.config.js',
    ],
  },

  // ---- Base for all TS/JS source ----
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ['eslint.config.js', '*.config.js'],
        },
        tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        ...globals.browser,
      },
    },
    plugins: {
      'eslint-comments': eslintComments,
      'import-x': importX,
    },
    rules: {
      // eslint-comments (AGENTS.md §18.2)
      'eslint-comments/require-description': 'error',
      'eslint-comments/no-unlimited-disable': 'error',
      'eslint-comments/no-unused-disable': 'error',

      // import-x
      'import-x/no-cycle': 'error',
      'import-x/no-default-export': 'error',
      'import-x/no-extraneous-dependencies': 'error',

      // Additional hard rules (AGENTS.md §18.2)
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/strict-boolean-expressions': 'error',
      '@typescript-eslint/prefer-readonly': 'error',
      '@typescript-eslint/ban-ts-comment': [
        'error',
        { 'ts-expect-error': 'allow-with-description' },
      ],
      'no-console': 'error',

      // Untrusted-content and forbidden API surface (AGENTS.md §15.2 / §25).
      // Logger calls take a stable code plus a structured payload — never
      // template literals (keeps chat content and names out of logs, §18.7).
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "CallExpression > MemberExpression[object.name='document'][property.name='write']",
          message: 'document.write is forbidden.',
        },
        { selector: "CallExpression[callee.name='eval']", message: 'eval is forbidden.' },
        {
          selector: "NewExpression[callee.name='Function']",
          message: 'The Function constructor is forbidden.',
        },
        {
          selector: "Identifier[name='localStorage']",
          message: 'localStorage may only be used by the theme preference hook (AGENTS.md §15.4).',
        },
        {
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message: 'dangerouslySetInnerHTML is forbidden; render text or the formatting AST.',
        },
        {
          selector: "CallExpression[callee.object.name='logger'] TemplateLiteral",
          message:
            'logger calls take a code string plus a structured payload — no template literals.',
        },
      ],

      'no-restricted-properties': [
        'error',
        { object: '*', property: 'innerHTML' },
        { object: '*', property: 'outerHTML' },
        { object: '*', property: 'insertAdjacentHTML' },
      ],
      'max-depth': ['error', 4],
      'max-params': ['error', 4],
      'max-lines': ['error', 400],
      'max-lines-per-function': ['error', 80],

      // Numbers and booleans are legitimate in interpolated strings.
      '@typescript-eslint/restrict-template-expressions': [
        'error',
        { allowNumber: true, allowBoolean: true },
      ],
    },
    settings: {
      'import-x/resolver': {
        typescript: {
          alwaysTryTypes: true,
        },
      },
      // vite-plugin-pwa provides this module at build time.
      'import-x/core-modules': ['virtual:pwa-register'],
    },
  },

  // ---- React (app UI) ----
  {
    files: ['src/app/**/*.tsx', 'src/app/**/*.ts'],
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      'jsx-a11y': jsxA11y,
    },
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
      globals: { ...globals.browser },
    },
    rules: {
      ...reactHooks.configs['recommended-latest'].rules,
      ...reactRefresh.configs.vite.rules,
      ...jsxA11y.flatConfigs.strict.rules,
      'react-hooks/exhaustive-deps': 'error',
      'max-lines-per-function': ['error', 150],
    },
  },

  // ---- core / storage: explicit boundaries, no magic numbers in core ----
  {
    files: ['src/core/**/*.ts', 'src/storage/**/*.ts'],
    rules: {
      '@typescript-eslint/explicit-module-boundary-types': 'error',
    },
  },
  {
    files: ['src/core/**/*.ts'],
    rules: {
      '@typescript-eslint/no-magic-numbers': [
        'error',
        { ignore: [-1, 0, 1, 2], ignoreArrayIndexes: true },
      ],
    },
  },
  // Test data literals (dates, counts) are not magic numbers.
  {
    files: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    rules: {
      '@typescript-eslint/no-magic-numbers': 'off',
    },
  },
  // A constants file's VALUES are the named constants themselves — the rule
  // targets magic numbers in logic, not constant definitions (§18.6).
  {
    files: ['src/core/limits.ts'],
    rules: {
      '@typescript-eslint/no-magic-numbers': 'off',
    },
  },

  // ---- Logger sink may use console (dev builds only, §18.7) ----
  {
    files: ['src/app/logging/**/*.ts'],
    rules: { 'no-console': 'off' },
  },

  // ---- Theme preference hook is the only localStorage user ----
  {
    files: ['src/app/hooks/use-theme-preference.ts'],
    rules: { 'no-restricted-syntax': 'off' },
  },

  // ---- Node context: scripts, configs, e2e tests ----
  {
    files: [
      'scripts/**/*.ts',
      'tests/e2e/**/*.ts',
      '*.config.ts',
      '*.config.js',
      'eslint.config.js',
    ],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      'no-console': 'off',
      'import-x/no-default-export': 'off',
      'import-x/no-extraneous-dependencies': ['error', { devDependencies: true }],
    },
  },

  // ---- Unit/component tests: dev imports allowed, vitest globals imported explicitly ----
  {
    files: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'tests/**/*.test.ts'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      'import-x/no-extraneous-dependencies': ['error', { devDependencies: true }],
    },
  },
);
