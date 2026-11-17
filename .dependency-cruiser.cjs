/**
 * Layer rules from AGENTS.md §3.1. `client` may import `workers` because the
 * RPC interfaces are imported type-only; the type-only constraint is enforced
 * in review (documented in ADR 0002).
 */
module.exports = {
  forbidden: [
    {
      name: 'core-imports-nothing-above-it',
      comment: 'core is pure domain logic with no platform dependencies',
      severity: 'error',
      from: { path: '^src/core' },
      to: { path: '^src/(app|client|platform|storage|workers)' },
    },
    {
      name: 'storage-below-core-only',
      comment: 'storage may only use core, never UI or worker layers',
      severity: 'error',
      from: { path: '^src/storage' },
      to: { path: '^src/(app|client|platform|workers)' },
    },
    {
      name: 'workers-no-ui',
      comment: 'workers never touch the UI layer',
      severity: 'error',
      from: { path: '^src/workers' },
      to: { path: '^src/(app|client)' },
    },
    {
      name: 'client-below-workers',
      comment: 'client talks to workers (type-only) and core, nothing else',
      severity: 'error',
      from: { path: '^src/client' },
      to: { path: '^src/(app|platform|storage)' },
    },
    {
      name: 'platform-below-core',
      comment: 'platform is a thin browser-API wrapper',
      severity: 'error',
      from: { path: '^src/platform' },
      to: { path: '^src/(app|client|storage|workers)' },
    },
    {
      name: 'app-never-storage-or-workers',
      comment: 'the UI reaches storage/workers only through the typed clients',
      severity: 'error',
      from: { path: '^src/app' },
      to: { path: ['^src/storage', '^src/workers'] },
    },
    {
      name: 'no-circular',
      comment: 'circular imports are not allowed in any layer',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsConfig: { fileName: 'tsconfig.json' },
    reporterOptions: {
      dot: { collapsePattern: 'node_modules/[^/]+' },
    },
  },
};
