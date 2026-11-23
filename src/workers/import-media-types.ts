/**
 * Shared types of the import media phase: the
 * injectable IO and the phase result. Split out so the media phase
 * and its thumbnail helper share them without an import cycle.
 */
import type { Result } from '../core/result';
import type { InsertableAttachment } from '../storage/sqlite/import-commit';
import type { ArchiveError, OpenedArchive } from './archive-reader';

/** A generated thumbnail (JPEG bytes plus the original dimensions). */
export interface ThumbnailResult {
  readonly data: Uint8Array;
  readonly width: number;
  readonly height: number;
}

/** Injectable IO for the media phase. The opened archive is the
 * ONE zip reader shared by the whole phase. */
export interface MediaPhaseDeps {
  /** The opened archive (single central-directory parse). */
  readonly archive: OpenedArchive;
  /** Safe non-text entries with their declared sizes. */
  readonly listEntries: () => Promise<
    Result<readonly { readonly name: string; readonly size: number }[], ArchiveError>
  >;
  /** Opens an OPFS file and returns its streaming sink (worker sync
   * handle); the caller streams chunks and closes. */
  readonly openWriteSink: (
    path: string,
  ) => Promise<
    Result<
      { readonly write: (chunk: Uint8Array) => Promise<void>; readonly close: () => Promise<void> },
      string
    >
  >;
  /** Buffers one SMALL entry whole — thumbnail inputs only. */
  readonly readEntryBuffered: (name: string) => Promise<Result<Uint8Array, ArchiveError>>;
  /** Deletes one written path (rollback). */
  readonly deleteFile: (path: string) => Promise<boolean>;
  /** JPEG thumbnail generator; null produces no thumbnails (the gallery shows a type icon instead). */
  readonly makeThumbnail: ((bytes: Uint8Array) => Promise<ThumbnailResult | null>) | null;
  /** Media types that get thumbnails (production: images only). */
  readonly thumbnailTypes: ReadonlySet<string>;
}

/** The media phase outcome: attachment rows for the commit plus every OPFS
 * path written (for recordWrittenPaths and rollback). */
export interface MediaPhaseResult {
  readonly attachments: readonly InsertableAttachment[];
  readonly writtenPaths: readonly string[];
}
