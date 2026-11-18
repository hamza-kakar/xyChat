/**
 * Core safety limits for untrusted import input (AGENTS.md §15.2). Constants
 * live in core so workers and the UI share them without layer violations
 * (§3.1). Exceeding any limit produces a typed error, never a crash.
 */
/** Bytes per MiB. */
const MIB = 1024 * 1024;
/** Bytes per GiB. */
const GIB = 1024 * MIB;

export const IMPORT_LIMITS = {
  /** Maximum accepted size of the exported chat text file. */
  maxTextFileBytes: 200 * MIB,
  /** Maximum accepted size of a single media entry inside an archive. */
  maxMediaEntryBytes: 2 * GIB,
  /** Maximum number of entries accepted inside one archive. */
  maxZipEntries: 100_000,
  /** Maximum size of a `.vcf` contact card we are willing to parse. */
  maxVcfBytes: 1 * MIB,
  /** Abort an archive whose uncompressed total exceeds this. */
  maxUncompressedTotalBytes: 20 * GIB,
  /** Abort an entry whose compression ratio exceeds this value. */
  maxCompressionRatio: 1000,
} as const;
