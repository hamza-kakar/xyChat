/**
 * Collects the licenses of the bundled runtime dependencies (AGENTS.md
 * §12.9 About): every package reachable through `dependencies` from the
 * app's package.json, with its version, SPDX license and license text.
 * Resolution follows Node's lookup (node_modules folders walking up from
 * the depending package's real path), which works with pnpm's layout.
 */
import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** One bundled package in the generated list. */
export interface LicenseEntry {
  readonly name: string;
  readonly version: string;
  readonly license: string;
  readonly text: string | null;
}

interface PackageJson {
  readonly name?: unknown;
  readonly version?: unknown;
  readonly license?: unknown;
  readonly dependencies?: unknown;
}

const LICENSE_FILE = /^(?:licen[cs]e|copying)(?:\.(?:md|txt))?$/iu;

function readPackageJson(dir: string): PackageJson {
  return JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as PackageJson;
}

function dependencyNames(pkg: PackageJson): readonly string[] {
  const deps = pkg.dependencies;
  return typeof deps === 'object' && deps !== null ? Object.keys(deps) : [];
}

/** Finds an installed package the way Node does, from a package folder. */
function findPackageDir(name: string, fromDir: string): string | null {
  let dir = fromDir;
  for (;;) {
    const candidate = join(dir, 'node_modules', name);
    if (existsSync(join(candidate, 'package.json'))) {
      return realpathSync(candidate);
    }
    const parent = dirname(dir);
    if (parent === dir) {
      return null;
    }
    dir = parent;
  }
}

function readLicenseText(dir: string): string | null {
  const file = readdirSync(dir).find((entry) => LICENSE_FILE.test(entry));
  return file === undefined ? null : readFileSync(join(dir, file), 'utf8').trim();
}

/**
 * Lists the licenses of every runtime dependency of the project.
 *
 * @param projectRoot The folder holding the app's package.json.
 * @returns Entries sorted by name then version, one per installed package
 *   (dependencies that aren't installed, such as skipped optional ones,
 *   are left out).
 */
export function collectLicenses(projectRoot: string): readonly LicenseEntry[] {
  const seen = new Map<string, LicenseEntry>();
  const queue: { readonly name: string; readonly fromDir: string }[] = dependencyNames(
    readPackageJson(projectRoot),
  ).map((name) => ({ name, fromDir: projectRoot }));
  for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
    const dir = findPackageDir(next.name, next.fromDir);
    if (dir === null) {
      continue;
    }
    const pkg = readPackageJson(dir);
    const version = typeof pkg.version === 'string' ? pkg.version : '0.0.0';
    const key = `${next.name}@${version}`;
    if (seen.has(key)) {
      continue;
    }
    seen.set(key, {
      name: next.name,
      version,
      license: typeof pkg.license === 'string' ? pkg.license : 'UNKNOWN',
      text: readLicenseText(dir),
    });
    queue.push(...dependencyNames(pkg).map((name) => ({ name, fromDir: dir })));
  }
  return [...seen.values()].sort(
    (a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version),
  );
}
