/**
 * Opens the full-screen media viewer from a bubble. The chat view owns the
 * viewer, so it renders outside the message rows: a viewer inside a row
 * would pass its touches to the row's long-press and context-menu
 * handlers.
 */
import { createContext } from 'react';
import type { AttachmentView, WindowMessage } from '../../../client/db-client';

/** Opens the viewer on one message's attachment; null outside a chat view. */
export type OpenMedia = (message: WindowMessage, attachment: AttachmentView) => void;

export const OpenMediaContext = createContext<OpenMedia | null>(null);
