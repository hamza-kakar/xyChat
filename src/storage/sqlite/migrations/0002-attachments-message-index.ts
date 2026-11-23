/**
 * Migration 0002 — index attachments by message.
 * The chat view reads a window's attachments in one join on
 * `message_id`; without this index that join scans every attachment of
 * every chat.
 */
export const SQL_0002_ATTACHMENTS_MESSAGE_INDEX = `
CREATE INDEX IF NOT EXISTS idx_attachments_message ON attachments(message_id);
`;
