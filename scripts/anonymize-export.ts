/**
 * Anonymizer CLI (AGENTS.md §19.3): `pnpm anonymize <input.txt|zip> <out-dir>`.
 * Text exports are parsed and rebuilt with anonymized free text; zip exports
 * additionally get their media entries replaced with tiny placeholder files
 * of the same name and type. Output goes to `<out-dir>/` as an anonymized
 * `.txt` (and `.zip` for archives) plus a mapping-free report of counts.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { basename, join, resolve } from 'node:path';
import * as zipJs from '@zip.js/zip.js';
import { detectFormat, parseChat, type DetectedFormat } from '../src/core/parser';
import { anonymizeExportText, collectAllNames, createAuthorMapper } from './anonymize-lib';

/** Tiny valid placeholder bytes per media extension family. */
const PLACEHOLDER_BY_EXTENSION: Readonly<Record<string, Uint8Array>> = {
  // 1x1 transparent PNG.
  png: new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48,
    0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00,
    0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78,
    0x9c, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00,
    0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
  ]),
};

/** Placeholder bytes for a file name (family-derived, minimal validity). */
function placeholderFor(fileName: string): Uint8Array {
  const ext = fileName.slice(fileName.lastIndexOf('.') + 1).toLowerCase();
  return PLACEHOLDER_BY_EXTENSION[ext] ?? new TextEncoder().encode('placeholder');
}

/** Anonymizes a plain-text export; returns the new text and author count. */
function anonymizeTextExport(text: string): { readonly text: string; readonly authors: number } {
  const detected = detectFormat(text);
  if (!detected.ok) {
    throw new Error(`cannot anonymize: ${detected.error.code}`);
  }
  const parsed = parseChat(text, { format: detected.value });
  if (!parsed.ok) {
    throw new Error('cannot anonymize: parse failed');
  }
  const names = collectAllNames(parsed.value.messages);
  const mapper = createAuthorMapper(names);
  return {
    text: anonymizeExportText(parsed.value.messages, detected.value, mapper),
    authors: names.length,
  };
}

/** Anonymizes a zip export: chat text transformed, media replaced. */
async function anonymizeZipExport(bytes: Uint8Array): Promise<{ readonly outBytes: Uint8Array; readonly authors: number; readonly mediaFiles: number }> {
  const reader = new zipJs.ZipReader(new zipJs.BlobReader(new Blob([bytes.slice().buffer as ArrayBuffer])));
  const writer = new zipJs.ZipWriter(new zipJs.BlobWriter('application/zip'));
  let chatText: string | null = null;
  let chatEntryName: string | null = null;
  let mediaFiles = 0;
  const entries = await reader.getEntries();
  for (const entry of entries) {
    if (entry.directory) {
      continue;
    }
    const name = entry.filename;
    if (name.includes('__MACOSX') || basename(name).startsWith('.')) {
      continue;
    }
    if (name.endsWith('.txt')) {
      chatEntryName = name;
      chatText = await entry.getData(new zipJs.TextWriter());
      continue;
    }
    const data = await entry.getData(new zipJs.Uint8ArrayWriter());
    await writer.add(name, new zipJs.BlobReader(new Blob([placeholderFor(name).slice().buffer as ArrayBuffer])));
    mediaFiles += 1;
  }
  await reader.close();
  if (chatText === null || chatEntryName === null) {
    throw new Error('no chat text entry found in archive');
  }
  const anonymized = anonymizeTextExport(chatText);
  await writer.add(chatEntryName, new zipJs.BlobReader(new Blob([new TextEncoder().encode(anonymized.text)])));
  const outBlob = await writer.close();
  const outBytes = new Uint8Array(await outBlob.arrayBuffer());
  return { outBytes, authors: anonymized.authors, mediaFiles };
}

/** CLI entry. */
async function main(): Promise<void> {
  const [inputArg, outDirArg] = process.argv.slice(2);
  if (inputArg === undefined || outDirArg === undefined) {
    console.error('usage: pnpm anonymize <input.txt|zip> <out-dir>');
    process.exit(1);
  }
  const inputPath = resolve(inputArg);
  const outDir = resolve(outDirArg);
  mkdirSync(outDir, { recursive: true });
  const inputName = basename(inputArg);

  if (inputName.endsWith('.zip')) {
    const bytes = readFileSync(inputPath);
    const result = await anonymizeZipExport(new Uint8Array(bytes));
    const outPath = join(outDir, `anonymized-${inputName}`);
    writeFileSync(outPath, result.outBytes);
    console.log(`wrote ${outPath} (${result.authors} authors, ${result.mediaFiles} media files replaced)`);
    return;
  }
  if (inputName.endsWith('.txt')) {
    const text = readFileSync(inputPath, 'utf8');
    const result = anonymizeTextExport(text);
    const outPath = join(outDir, `anonymized-${inputName}`);
    writeFileSync(outPath, result.text, 'utf8');
    console.log(`wrote ${outPath} (${result.authors} authors)`);
    return;
  }
  console.error('input must be .txt or .zip');
  process.exit(1);
}

// Only run the CLI when this file is the process entry point; the module's
// functions are imported by tests directly.
const entryPath = process.argv[1] === undefined ? '' : resolve(process.argv[1]);
if (entryPath === fileURLToPath(import.meta.url)) {
  void main();
}
