/**
 * Archive reader (AGENTS.md §9.2 steps 1–3): opens a `.zip` or `.txt`
 * export, validates size and magic bytes, locates the chat text, and
 * decodes it — with the §15.2 safety limits (zip bombs, path traversal).
 * No full-archive load into memory: zip.js reads the central directory
 * lazily and streams one entry at a time.
 */
import * as zipJs from '@zip.js/zip.js';
import { err, ok, type Result } from '../core/result';
import { IMPORT_LIMITS } from '../core/limits';

/** Error codes for archive reading (§9.2, §15.2). */
export type ArchiveErrorCode =
  | 'UNSUPPORTED_FILE_TYPE'
  | 'FILE_TOO_LARGE'
  | 'CORRUPT_ARCHIVE'
  | 'ARCHIVE_TOO_LARGE'
  | 'PATH_TRAVERSAL'
  | 'TOO_MANY_ENTRIES'
  | 'NO_CHAT_TEXT_FOUND';

/** A structured archive-read failure. */
export interface ArchiveError {
  readonly code: ArchiveErrorCode;
  /** Counts/positions only — never file content (§18.7). */
  readonly detail: string;
}

/** The located chat text plus archive facts for the report (§9.2 step 11). */
export interface ArchiveContent {
  /** Chat text decoded as UTF-8 (lossy on invalid sequences). */
  readonly text: string;
  /** True when the input was a zip archive (vs a bare .txt). */
  readonly wasZip: boolean;
  /** Replacement characters inserted by lossy decoding (§9.2 step 3). */
  readonly replacementChars: number;
  /** Total uncompressed size of scanned archive entries (quota check §9.2 step 1). */
  readonly uncompressedTotalBytes: number;
}

/** ZIP local-file-header magic (§9.2 step 1). */
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];

/** True when the file name ends with an accepted extension. */
function hasAcceptedExtension(name: string): boolean {
  return name.toLowerCase().endsWith('.zip') || name.toLowerCase().endsWith('.txt');
}

/** True when the leading bytes match the ZIP magic. */
function hasZipMagic(bytes: Uint8Array): boolean {
  return (
    bytes.length >= ZIP_MAGIC.length && ZIP_MAGIC.every((byte, index) => bytes[index] === byte)
  );
}

/** Rejects entry names with path traversal, absolute paths, or NULs (§15.2). */
function isSafeEntryName(name: string): boolean {
  if (name.includes('\u0000')) {
    return false;
  }
  if (name.startsWith('/') || /^[a-zA-Z]:/u.test(name)) {
    return false;
  }
  const segments = name.split('/');
  return segments.every((segment) => segment !== '..' && segment !== '');
}

/**
 * Reads the chat text out of an export file.
 *
 * @param file The user-selected `File` (Blob) from the import picker.
 * @returns The decoded chat text plus archive facts, or a structured error.
 * @example
 * const result = await readArchive(file);
 * if (!result.ok) showError(result.error.code);
 */
export async function readArchive(
  file: Blob & { readonly name: string },
): Promise<Result<ArchiveContent, ArchiveError>> {
  // §9.2 step 1: validate size and type before touching the contents.
  if (!hasAcceptedExtension(file.name)) {
    return err({ code: 'UNSUPPORTED_FILE_TYPE', detail: file.name.slice(-24) });
  }
  if (file.size > IMPORT_LIMITS.maxTextFileBytes) {
    return err({ code: 'FILE_TOO_LARGE', detail: `${file.size} bytes` });
  }

  const head = new Uint8Array(await file.slice(0, ZIP_MAGIC.length).arrayBuffer());
  const isZip = hasZipMagic(head);

  if (!isZip) {
    return readTextFile(file);
  }
  return readZipFile(file);
}

/** Reads a bare `.txt` export. */
async function readTextFile(file: Blob): Promise<Result<ArchiveContent, ArchiveError>> {
  const buffer = await file.arrayBuffer();
  const { text, replacementChars } = decodeUtf8Lossy(buffer);
  if (text.trim() === '') {
    return err({ code: 'NO_CHAT_TEXT_FOUND', detail: 'empty text file' });
  }
  return ok({
    text,
    wasZip: false,
    replacementChars,
    uncompressedTotalBytes: buffer.byteLength,
  });
}

/** Reads a `.zip` export: locate and decode the chat text entry only. */
async function readZipFile(file: Blob): Promise<Result<ArchiveContent, ArchiveError>> {
  let reader: zipJs.ZipReader<zipJs.BlobReader> | null = null;
  try {
    reader = new zipJs.ZipReader(new zipJs.BlobReader(file));
    const entries = await reader.getEntries();
    if (entries.length > IMPORT_LIMITS.maxZipEntries) {
      return err({ code: 'TOO_MANY_ENTRIES', detail: `${entries.length} entries` });
    }

    let uncompressedTotalBytes = 0;
    let chatEntry: zipJs.Entry | null = null;
    let chatEntryName = '';

    for (const entry of entries) {
      if (entry.directory) {
        continue;
      }
      const name = entry.filename;
      // §15.2: reject traversal/absolute/NUL names anywhere in the archive.
      if (!isSafeEntryName(name)) {
        return err({ code: 'PATH_TRAVERSAL', detail: name.slice(-40) });
      }
      // §9.2 step 2: ignore macOS metadata and dotfiles.
      if (name.includes('__MACOSX') || name.split('/').pop()?.startsWith('.') === true) {
        continue;
      }
      uncompressedTotalBytes += entry.uncompressedSize;
      if (uncompressedTotalBytes > IMPORT_LIMITS.maxUncompressedTotalBytes) {
        return err({ code: 'ARCHIVE_TOO_LARGE', detail: `${uncompressedTotalBytes} bytes` });
      }
      if (!name.toLowerCase().endsWith('.txt')) {
        continue;
      }
      // §9.2 step 2: _chat.txt → WhatsApp Chat*.txt → largest .txt.
      if (
        chatEntry === null ||
        name === '_chat.txt' ||
        (chatEntryName !== '_chat.txt' &&
          name.toLowerCase().startsWith('whatsapp chat') &&
          !chatEntryName.toLowerCase().startsWith('whatsapp chat')) ||
        entry.uncompressedSize > chatEntry.uncompressedSize
      ) {
        chatEntry = entry;
        chatEntryName = name;
      }
    }

    if (chatEntry === null) {
      return err({ code: 'NO_CHAT_TEXT_FOUND', detail: `${entries.length} entries scanned` });
    }

    const text = await chatEntry.getData(new zipJs.TextWriter());
    const { text: decoded, replacementChars } = decodeTextLossy(text);
    return ok({
      text: decoded,
      wasZip: true,
      replacementChars,
      uncompressedTotalBytes,
    });
  } catch (error) {
    return err({ code: 'CORRUPT_ARCHIVE', detail: String(error).slice(0, 160) });
  } finally {
    await reader?.close();
  }
}

/** Decodes a zip-entry text that zip.js already produced, counting U+FFFD. */
function decodeTextLossy(text: string): {
  readonly text: string;
  readonly replacementChars: number;
} {
  let replacementChars = 0;
  for (const char of text) {
    if (char === '\uFFFD') {
      replacementChars += 1;
    }
  }
  return { text, replacementChars };
}

/** Decodes raw bytes as UTF-8 with replacement chars counted (§9.2 step 3). */
function decodeUtf8Lossy(buffer: ArrayBuffer): {
  readonly text: string;
  readonly replacementChars: number;
} {
  const decoder = new TextDecoder('utf-8', { fatal: false });
  const text = decoder.decode(buffer);
  let replacementChars = 0;
  for (const char of text) {
    if (char === '\uFFFD') {
      replacementChars += 1;
    }
  }
  return { text, replacementChars };
}

/** Reads raw bytes of one zip entry (media writing, §9.2 step 8). */
export async function readZipEntryBytes(file: Blob, entryName: string): Promise<Uint8Array | null> {
  const reader = new zipJs.ZipReader(new zipJs.BlobReader(file));
  try {
    for (const entry of await reader.getEntries()) {
      if (entry.filename === entryName && !entry.directory) {
        return await entry.getData(new zipJs.Uint8ArrayWriter());
      }
    }
    return null;
  } finally {
    await reader.close();
  }
}

/** Lists safe media entry names of an archive (§9.2 step 8 input). */
export async function listMediaEntries(
  file: Blob,
): Promise<Result<readonly { readonly name: string; readonly size: number }[], ArchiveError>> {
  const reader = new zipJs.ZipReader(new zipJs.BlobReader(file));
  try {
    const out: { readonly name: string; readonly size: number }[] = [];
    for (const entry of await reader.getEntries()) {
      if (entry.directory) {
        continue;
      }
      const name = entry.filename;
      if (
        !isSafeEntryName(name) ||
        name.includes('__MACOSX') ||
        name.split('/').pop()?.startsWith('.') === true
      ) {
        continue;
      }
      if (name.toLowerCase().endsWith('.txt')) {
        continue;
      }
      out.push({ name, size: entry.uncompressedSize });
    }
    return ok(out);
  } catch (error) {
    return err({ code: 'CORRUPT_ARCHIVE', detail: String(error).slice(0, 160) });
  } finally {
    await reader.close();
  }
}

export { err };
