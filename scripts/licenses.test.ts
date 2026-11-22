import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { collectLicenses } from './licenses-lib';

let root = '';

function writePackage(dir: string, pkg: object, license?: [string, string]): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify(pkg));
  if (license !== undefined) {
    writeFileSync(join(dir, license[0]), license[1]);
  }
}

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('collectLicenses', () => {
  it('walks runtime dependencies transitively, nested copies included', () => {
    root = mkdtempSync(join(tmpdir(), 'licenses-'));
    writePackage(root, {
      name: 'app',
      dependencies: { alpha: '1', missing: '1' },
      devDependencies: { tool: '1' },
    });
    const modules = join(root, 'node_modules');
    writePackage(
      join(modules, 'alpha'),
      { name: 'alpha', version: '1.2.0', license: 'MIT', dependencies: { beta: '2' } },
      ['LICENSE', ' MIT text \n'],
    );
    writePackage(join(modules, 'alpha', 'node_modules', 'beta'), {
      name: 'beta',
      version: '2.0.0',
      license: 'ISC',
    });
    writePackage(join(modules, 'beta'), { name: 'beta', version: '1.0.0' }, ['LICENCE.md', 'old']);
    writePackage(join(modules, 'tool'), { name: 'tool', version: '9.0.0', license: 'MIT' });

    expect(collectLicenses(root)).toEqual([
      { name: 'alpha', version: '1.2.0', license: 'MIT', text: 'MIT text' },
      { name: 'beta', version: '2.0.0', license: 'ISC', text: null },
    ]);
  });
});
