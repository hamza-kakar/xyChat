/**
 * Thumbnail step of the import media phase (AGENTS.md §9.2 step 9): decides
 * which images qualify, decodes them through the injected generator and
 * stores the JPEG. Every failure degrades to no thumbnail; the gallery then
 * shows a type icon.
 */
import { IMPORT_LIMITS } from '../core/limits';
import { mediaTypeForFileName } from '../core/parser/attachments';
import type { MediaPhaseDeps, ThumbnailResult } from './import-media-types';

/** Thumbnail fields of an attachment row (all null without a thumbnail). */
export interface ThumbnailFields {
  readonly thumbPath: string | null;
  readonly width: number | null;
  readonly height: number | null;
}

/** The row fields when there is no thumbnail. */
export const NO_THUMBNAIL: ThumbnailFields = { thumbPath: null, width: null, height: null };

/** One thumbnail attempt for a stored media entry. */
export interface ThumbnailJob {
  readonly deps: MediaPhaseDeps;
  readonly zipSizes: ReadonlyMap<string, number>;
  /** The archive entry to decode. */
  readonly fileName: string;
  /** Where the JPEG goes (thumbs/<chatId>/<attachmentId>.jpg). */
  readonly thumbPath: string;
  /** Records a path for §9.3 rollback before its file is created. */
  readonly recordPath: (path: string) => Promise<void>;
  /** Called once per qualifying image, whatever the outcome (§9.1). */
  readonly onAttemptDone: () => void;
}

/**
 * Whether an entry gets a thumbnail: a generator exists, the type
 * qualifies, and the entry is small enough to decode in memory (§9.4).
 *
 * @param deps The phase IO (generator and qualifying types).
 * @param zipSizes Declared entry sizes from the archive.
 * @param fileName The entry name, or null when the export omitted it.
 * @returns True when a thumbnail should be attempted.
 */
export function qualifiesForThumbnail(
  deps: MediaPhaseDeps,
  zipSizes: ReadonlyMap<string, number>,
  fileName: string | null,
): boolean {
  if (fileName === null || deps.makeThumbnail === null) {
    return false;
  }
  const size = zipSizes.get(fileName);
  return (
    size !== undefined &&
    size <= IMPORT_LIMITS.maxThumbnailSourceBytes &&
    deps.thumbnailTypes.has(mediaTypeForFileName(fileName))
  );
}

/**
 * Generates and stores a thumbnail for a qualifying image.
 *
 * @param job The entry, target path and bookkeeping callbacks.
 * @returns The row's thumbnail fields; NO_THUMBNAIL on any failure.
 */
export async function storeThumbnail(job: ThumbnailJob): Promise<ThumbnailFields> {
  if (!qualifiesForThumbnail(job.deps, job.zipSizes, job.fileName)) {
    return NO_THUMBNAIL;
  }
  try {
    const thumbnail = await decodeThumbnail(job.deps, job.fileName);
    if (thumbnail === null) {
      return NO_THUMBNAIL;
    }
    const isWritten = await writeSmallFile(job, thumbnail.data);
    return isWritten
      ? { thumbPath: job.thumbPath, width: thumbnail.width, height: thumbnail.height }
      : NO_THUMBNAIL;
  } finally {
    job.onAttemptDone();
  }
}

/** Decodes the entry into a thumbnail; every failure is null. The entry is
 * buffered whole, which qualifiesForThumbnail bounds by size. */
async function decodeThumbnail(
  deps: MediaPhaseDeps,
  fileName: string,
): Promise<ThumbnailResult | null> {
  if (deps.makeThumbnail === null) {
    return null;
  }
  const buffered = await deps.readEntryBuffered(fileName);
  if (!buffered.ok) {
    return null;
  }
  try {
    return await deps.makeThumbnail(buffered.value);
  } catch {
    return null;
  }
}

/** Writes the JPEG. A failed write deletes the partial file and reports
 * false instead of failing the import. */
async function writeSmallFile(job: ThumbnailJob, data: Uint8Array): Promise<boolean> {
  await job.recordPath(job.thumbPath);
  const sink = await job.deps.openWriteSink(job.thumbPath);
  if (!sink.ok) {
    await job.deps.deleteFile(job.thumbPath);
    return false;
  }
  let isWritten = false;
  try {
    await sink.value.write(data);
    isWritten = true;
  } catch {
    // Degrade to no thumbnail; the partial file is deleted below.
  } finally {
    await sink.value.close();
  }
  if (!isWritten) {
    await job.deps.deleteFile(job.thumbPath);
  }
  return isWritten;
}
