/**
 * Import detection phase (`detecting`):
 * reads the archive, detects the format, and derives everything the
 * confirmation screen needs — participants, group heuristic, editable title,
 * media-file count and the first-messages sample. Pure module (no Comlink,
 * no DOM) so it is unit-tested in Node; import.worker calls it.
 *
 * Note: this parses the full text once for the metadata; after the user
 * confirms (possibly with an adjusted date order), the pipeline re-parses
 * with the confirmed format.
 */
import { err, ok, type Result } from '../core/result';
import {
  detectFormat,
  parseChat,
  type DetectedFormat,
  type DetectFormatOptions,
} from '../core/parser';
import { isGroupChat, titleFromFileName } from '../core/chat-meta';
import { listMediaEntries, readArchive } from './archive-reader';
import type { ArchiveError } from './archive-gates';

/** Error codes for the import flow (user-facing text is
 * mapped from these codes in i18n). */
export type ImportErrorCode =
  | 'UNSUPPORTED_FILE_TYPE'
  | 'FILE_TOO_LARGE'
  | 'CORRUPT_ARCHIVE'
  | 'ARCHIVE_TOO_LARGE'
  | 'ENTRY_TOO_LARGE'
  | 'COMPRESSION_RATIO'
  | 'QUOTA_EXCEEDED'
  | 'PATH_TRAVERSAL'
  | 'TOO_MANY_ENTRIES'
  | 'ENTRY_NOT_FOUND'
  | 'NO_CHAT_TEXT_FOUND'
  | 'UNRECOGNIZED_FORMAT'
  | 'CANCELLED'
  | 'COMMIT_FAILED'
  | 'INTERNAL';

/** A structured import failure. */
export interface ImportError {
  readonly code: ImportErrorCode;
  /** Counts/positions only — never message or file content. */
  readonly detail: string;
}

/** Maps an archive-read failure onto the import error codes. */
function fromArchiveError(error: ArchiveError): ImportError {
  return { code: error.code, detail: error.detail };
}

/** Everything the confirmation screen shows. */
export interface DetectReport {
  /** Detected format — the user may override the date order on confirm. */
  readonly format: DetectedFormat;
  /** Pre-filled, editable title from the file name. */
  readonly title: string;
  /** Group heuristic. */
  readonly isGroup: boolean;
  /** Distinct authors in first-seen order (the "which one is you" list). */
  readonly participants: readonly string[];
  /** Selected file size. */
  readonly archiveBytes: number;
  /** Free storage at detection time (summary; null when the
   * estimate is unavailable). */
  readonly freeBytes: number | null;
  /** Uncompressed size of all archive entries (quota fact). */
  readonly uncompressedTotalBytes: number;
  /** U+FFFD count from lossy decoding (shown as a warning fact). */
  readonly replacementChars: number;
  /** Total parsed messages (confirm summary). */
  readonly messagesCount: number;
  /** Referenced media files actually present in the archive. */
  readonly mediaFilesFound: number;
  /** Referenced media files missing from the archive. */
  readonly mediaFilesMissing: number;
}

/** Options for detection. */
export interface DetectOptions {
  /** BCP-47 tag for ambiguous date orders. */
  readonly localeHint?: string;
  /**  the confirm screen's DMY/MDY toggle re-runs detection with
   * the user's order (marked `dateOrderSource: 'user'`). */
  readonly dateOrderOverride?: 'DMY' | 'MDY';
}

/**
 * Runs the detection phase over an export file.
 *
 * @param fileName The file's name (title source).
 * @param file The picked file blob.
 * @param options Locale hint and phase options.
 * @returns The confirmation report, or a structured failure.
 */
export async function detectExport(
  fileName: string,
  file: Blob,
  options: DetectOptions = {},
): Promise<Result<DetectReport, ImportError>> {
  const archive = await readArchive(file, fileName);
  if (!archive.ok) {
    return err(fromArchiveError(archive.error));
  }

  const detectionOptions: DetectFormatOptions =
    options.localeHint === undefined ? {} : { localeHint: options.localeHint };
  const detected = detectFormat(archive.value.text, detectionOptions);
  if (!detected.ok) {
    return err({ code: 'UNRECOGNIZED_FORMAT', detail: detected.error.code });
  }
  const format =
    options.dateOrderOverride === undefined
      ? detected.value
      : {
          ...detected.value,
          dateOrder: options.dateOrderOverride,
          dateOrderSource: 'user' as const,
        };

  const parsed = parseChat(archive.value.text, { format });
  if (!parsed.ok) {
    return err({ code: 'UNRECOGNIZED_FORMAT', detail: parsed.error.code });
  }

  const media = await listMediaEntries(file);
  const mediaNames = new Set(media.ok ? media.value.map((entry) => entry.name) : []);
  let mediaFilesFound = 0;
  let mediaFilesMissing = 0;
  for (const message of parsed.value.messages) {
    const attachment = message.attachment;
    if (attachment?.status !== 'referenced') {
      continue;
    }
    if (mediaNames.has(attachment.fileName ?? '')) {
      mediaFilesFound += 1;
    } else {
      mediaFilesMissing += 1;
    }
  }

  const systemBodies = parsed.value.messages
    .filter((message) => message.kind === 'system')
    .map((message) => message.body);

  let freeBytes: number | null;
  try {
    const estimate = await navigator.storage.estimate();
    freeBytes = (estimate.quota ?? 0) - (estimate.usage ?? 0);
  } catch {
    //  an unavailable estimate must not fail detection — the summary
    // simply omits the free-storage line.
    freeBytes = null;
  }
  return ok({
    format,
    title: titleFromFileName(fileName),
    isGroup: isGroupChat(parsed.value.participants, systemBodies),
    participants: parsed.value.participants,
    archiveBytes: file.size,
    freeBytes,
    uncompressedTotalBytes: archive.value.uncompressedTotalBytes,
    replacementChars: archive.value.replacementChars,
    messagesCount: parsed.value.messages.length,
    mediaFilesFound,
    mediaFilesMissing,
  });
}
