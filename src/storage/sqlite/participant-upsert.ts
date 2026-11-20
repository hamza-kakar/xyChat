/**
 * Participant upsert (§10.2): deterministic UUID-shaped ids per (chatId,
 * displayName) so re-imports upsert instead of duplicating, and the color
 * index from the §10.2 palette hash.
 */
import type { SqliteDatabase } from './open';

/** Deterministic participant id from a chat + display name (stable, §10.2). */
function participantIdFor(chatId: string, displayName: string): string {
  const raw = `${chatId}:${displayName}`;
  let h1 = 0x811c9dc5;
  for (let i = 0; i < raw.length; i += 1) {
    h1 = (Math.imul(h1 ^ raw.charCodeAt(i), 0x01000193) >>> 0) % 0x100000000;
  }
  let h2 = 0x01000193;
  for (let i = raw.length - 1; i >= 0; i -= 1) {
    h2 = (Math.imul(h2 ^ raw.charCodeAt(i), 0x811c9dc5) >>> 0) % 0x100000000;
  }
  const hex = (n: number): string => n.toString(16).padStart(8, '0');
  return `${hex(h1).slice(0, 8)}-${hex(h1 ^ h2).slice(0, 4)}-4${hex(h2).slice(0, 3)}-8${hex(h1 ^ 0xa5a5a5a5).slice(0, 3)}-${hex(h2)}${hex(h1).slice(0, 4)}`;
}

/** Color index = stable hash of the display name modulo palette size (§10.2). */
function colorIndexFor(displayName: string): number {
  let h = 0;
  for (let i = 0; i < displayName.length; i += 1) {
    h = Math.imul(h ^ displayName.charCodeAt(i), 0x01000193) >>> 0;
  }
  return h % 12;
}

/** Inserts or updates one participant; returns its id. */
export function upsertParticipant(db: SqliteDatabase, chatId: string, displayName: string): string {
  const id = participantIdFor(chatId, displayName);
  db.run(
    `INSERT INTO participants (id, chat_id, display_name, color_index, message_count)
     VALUES (?, ?, ?, ?, 0)
     ON CONFLICT(chat_id, display_name) DO UPDATE SET display_name = excluded.display_name`,
    [id, chatId, displayName, colorIndexFor(displayName)],
  );
  return id;
}
