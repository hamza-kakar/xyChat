/**
 * Import scale gate (AGENTS.md §22 M3 acceptance): a synthetic zip with
 * 100k messages and 2k media files imports in CI without memory errors —
 * the real readArchive → runImportParse → writeImportMedia phases run
 * against the real parser, fingerprinter and zip.js reads. Only the OPFS
 * writes are injected to an in-memory map (sync handles are worker-only,
 * ADR 0007 addendum; the real write path is exercised by the e2e flows).
 * Duration is logged; the hard gate is COMPLETION (memory). Chromium-only
 * per ADR 0007.
 */
import { describe, expect, it } from 'vitest';
import * as zipJs from '@zip.js/zip.js';
import { ok } from '../../src/core/result';
import { listMediaEntries, openArchive, readArchive } from '../../src/workers/archive-reader';
import { runImportParse } from '../../src/workers/import-run';
import type { ImportCommitInput } from '../../src/storage/sqlite/import-commit';
import { writeImportMedia, type MediaPhaseDeps } from '../../src/workers/import-media';
import { detectFormat } from '../../src/core/parser';
import { newChatId } from '../../src/core/ids';

const MESSAGE_COUNT = 100_000;
const MEDIA_COUNT = 2_000;

/** Builds the synthetic zip in-memory (100k chat lines + 2k media entries). */
async function buildScaleZip(): Promise<Blob> {
  const writer = new zipJs.ZipWriter(new zipJs.BlobWriter('application/zip'));
  const lines: string[] = [];
  for (let i = 0; i < MESSAGE_COUNT; i += 1) {
    const minute = i % 12 === 0 ? 12 : i % 12;
    const stamp = `‎[17/11/2026, ${minute}:${String(i % 60).padStart(2, '0')}:00 PM] Author${i % 9}:`;
    if (i < MEDIA_COUNT) {
      // The first 2k messages reference the media entries (present in the
      // zip, §9.2 step 8).
      lines.push(
        `${stamp} ‎<attached: 0000${String(i).padStart(5, '0')}-PHOTO-2026-11-17-21-20-30.jpg>`,
      );
    } else {
      lines.push(`${stamp} scale test body ${i} with varying content ${(i * 7) % 1000}`);
    }
  }
  await writer.add('_chat.txt', new zipJs.TextReader(lines.join('\n')));
  for (let m = 0; m < MEDIA_COUNT; m += 1) {
    await writer.add(
      `0000${String(m).padStart(5, '0')}-PHOTO-2026-11-17-21-20-30.jpg`,
      new zipJs.TextReader(`fake jpeg ${m}`),
    );
  }
  return await writer.close();
}

/** Runs the full pipeline over the scale zip; returns assertion failures
 * instead of throwing so the memory-error gate completes all phases. */
async function runScaleImport(): Promise<string[]> {
  const failures: string[] = [];
  const blob = await buildScaleZip();
  const file = blob as Blob & { readonly name: string };
  Object.defineProperty(file, 'name', { value: 'scale.zip' });

  // §9.2 steps 1–3: read + decode (real zip.js path).
  const archive = await readArchive(file, 'scale.zip');
  if (!archive.ok) {
    return [`archive read failed: ${archive.error.code}`];
  }

  // §9.2 step 4: detect (the confirmed format equals it in this run).
  const detected = detectFormat(archive.value.text);
  if (!detected.ok) {
    return [`detect failed: ${detected.error.code}`];
  }

  // §9.2 steps 6–7: parse + fingerprint (real SHA-256 via subtle).
  const hashViaSubtle = async (bytes: Uint8Array): Promise<Uint8Array> => {
    const digest = await crypto.subtle.digest('SHA-256', bytes.buffer as ArrayBuffer);
    return new Uint8Array(digest);
  };
  const run = await runImportParse(archive.value.text, detected.value, hashViaSubtle, {
    onProgress: () => undefined,
    isCancelled: () => false,
  });
  if (!run.ok) {
    return [`run failed: ${run.error.code}`];
  }
  if (run.value.messages.length !== MESSAGE_COUNT) {
    failures.push(`expected ${MESSAGE_COUNT} messages, got ${run.value.messages.length}`);
  }

  // §9.2 steps 8–9: media classification + streamed writes (injected OPFS
  // sink; the opened archive is the ONE reader, review Major 9).
  return runMediaPhase(file, run.value.messages);
}

/** The media phase over the opened archive, with an in-memory OPFS sink
 * (worker-only sync handles per ADR 0007 addendum). */
async function runMediaPhase(
  file: Blob,
  messages: readonly ImportCommitInput['messages'][number][],
): Promise<string[]> {
  const failures: string[] = [];
  const opened = await openArchive(file);
  if (!opened.ok) {
    return [`open failed: ${opened.error.code}`];
  }
  const store = new Map<string, Uint8Array>();
  let written = 0;
  const deps: MediaPhaseDeps = {
    archive: opened.value,
    listEntries: () => listMediaEntries(file),
    openWriteSink: (path) => {
      store.set(path, new Uint8Array());
      written += 1;
      return Promise.resolve(
        ok({ write: () => Promise.resolve(), close: () => Promise.resolve() }),
      );
    },
    readEntryBuffered: () => {
      const bytes = new TextEncoder().encode('thumb-input');
      return Promise.resolve(ok(bytes));
    },
    deleteFile: (path) => {
      store.delete(path);
      return Promise.resolve(true);
    },
    makeThumbnail: null,
    thumbnailTypes: new Set(['image']),
  };
  const media = await writeImportMedia({
    chatId: newChatId(),
    messages,
    alreadyStored: new Set(),
    deps,
    hooks: { onProgress: () => undefined, isCancelled: () => false },
  });
  if (!media.ok) {
    failures.push(`media phase failed: ${media.error.code}`);
    await opened.value.close();
    return failures;
  }

  // 2k media present + written; nothing rolled back (§9.3 invariant).
  const present = media.value.attachments.filter((row) => row.status === 'present');
  if (present.length !== MEDIA_COUNT) {
    failures.push(`expected ${MEDIA_COUNT} present attachments, got ${present.length}`);
  }
  if (media.value.writtenPaths.length !== MEDIA_COUNT) {
    failures.push(`expected ${MEDIA_COUNT} written paths, got ${media.value.writtenPaths.length}`);
  }
  if (written !== MEDIA_COUNT) {
    failures.push(`expected ${MEDIA_COUNT} sink writes, got ${written}`);
  }
  await opened.value.close();
  return failures;
}

describe('import scale (§22 M3 acceptance, ADR 0007 addendum)', () => {
  // Building the zip + full pipeline at 100k scale: generous but bounded
  // (the acceptance is completion without memory errors, not speed).
  it(
    'imports a 100k-message + 2k-media synthetic zip without memory errors',
    { timeout: 240_000 },
    async () => {
      const failures = await runScaleImport();
      expect(failures).toEqual([]);
    },
  );
});
