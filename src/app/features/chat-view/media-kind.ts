import type { AttachmentView } from '../../../client/db-client';

/** True when the message renders without bubble chrome (a stored sticker,
 * §13.1). */
export function isBareSticker(attachment: AttachmentView | undefined): boolean {
  return attachment?.mediaType === 'sticker' && attachment.status === 'present';
}
