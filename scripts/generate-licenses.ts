/**
 * Writes public/licenses.json, the license list shown in Settings → About
 * (AGENTS.md §12.9). Run as part of `pnpm build`; the file is not committed.
 *
 * Usage: pnpm licenses:gen
 */
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectLicenses } from './licenses-lib';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const entries = collectLicenses(projectRoot);
writeFileSync(resolve(projectRoot, 'public/licenses.json'), `${JSON.stringify(entries)}\n`);
console.log(`licenses: ${String(entries.length)} packages`);
