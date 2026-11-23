/**
 * Chat-view state kept in the `meta` table: the last
 * opened chat and its scroll position, so a relaunch returns there. The
 * stored value is validated on read; anything invalid reads as
 * "no position".
 */
import * as v from 'valibot';
import { asChatId } from '../../core/ids';
import type { ChatPosition } from '../repository';
import type { SqliteDatabase } from './open';

/** The meta key for the last chat position. */
const LAST_CHAT_POSITION_KEY = 'last_chat_position';

const PositionSchema = v.object({
  chatId: v.pipe(v.string(), v.nonEmpty()),
  seq: v.pipe(v.number(), v.integer(), v.minValue(0)),
});

/** Parses a stored JSON value; null when absent, malformed or invalid. */
function parsePosition(text: unknown): ChatPosition | null {
  if (typeof text !== 'string') {
    return null;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  const result = v.safeParse(PositionSchema, raw);
  return result.success ? { chatId: asChatId(result.output.chatId), seq: result.output.seq } : null;
}

/**
 * Reads the last chat position.
 *
 * @param db The open database.
 * @returns The stored position, or null when none is stored, the value is
 *   invalid, or the chat no longer exists.
 */
export function getLastChatPosition(db: SqliteDatabase): ChatPosition | null {
  const row = db.selectObjects('SELECT value FROM meta WHERE key = ?', [LAST_CHAT_POSITION_KEY])[0];
  const position = parsePosition(row?.['value']);
  if (position === null) {
    return null;
  }
  const exists = db.selectObjects('SELECT 1 AS ok FROM chats WHERE id = ?', [position.chatId]);
  return exists.length > 0 ? position : null;
}

/**
 * Stores (or clears, with null) the last chat position.
 *
 * @param db The open database.
 * @param position The chat and top-visible seq, or null to forget it.
 */
export function setLastChatPosition(db: SqliteDatabase, position: ChatPosition | null): void {
  if (position === null) {
    db.run('DELETE FROM meta WHERE key = ?', [LAST_CHAT_POSITION_KEY]);
    return;
  }
  db.run(
    'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
    [LAST_CHAT_POSITION_KEY, JSON.stringify({ chatId: position.chatId, seq: position.seq })],
  );
}
