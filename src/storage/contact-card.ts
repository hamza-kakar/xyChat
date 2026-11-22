/**
 * Contact-card reads (AGENTS.md §12.5): finds a message's stored `.vcf`
 * and extracts its display name. Runs in db.worker; the file read is
 * injected so the selection and size rules are testable without OPFS.
 */
import { IMPORT_LIMITS } from '../core/limits';
import { parseVcardName } from '../core/vcard';
import type { Attachment } from './repository';

/** Reads a stored file as a Blob, or null when it is absent. */
export type ReadStoredFile = (path: string) => Promise<Blob | null>;

/**
 * Picks the stored contact card among a message's attachments.
 *
 * @param attachments The message's attachment rows.
 * @returns The present `contact-card` attachment, or null.
 */
export function storedContactCard(attachments: readonly Attachment[]): Attachment | null {
  return (
    attachments.find(
      (attachment) =>
        attachment.mediaType === 'contact-card' &&
        attachment.status === 'present' &&
        attachment.opfsPath !== null,
    ) ?? null
  );
}

/**
 * Reads the display name of a message's contact card.
 *
 * @param attachments The message's attachment rows.
 * @param readFile Reads a stored file (OPFS in the worker).
 * @returns The `FN` name, or null when there is no stored card, it is over
 *   IMPORT_LIMITS.maxVcfBytes, or it has no name.
 */
export async function readContactName(
  attachments: readonly Attachment[],
  readFile: ReadStoredFile,
): Promise<string | null> {
  const card = storedContactCard(attachments);
  const path = card?.opfsPath ?? null;
  if (path === null) {
    return null;
  }
  const blob = await readFile(path);
  if (blob === null || blob.size > IMPORT_LIMITS.maxVcfBytes) {
    return null;
  }
  return parseVcardName(await blob.text());
}
