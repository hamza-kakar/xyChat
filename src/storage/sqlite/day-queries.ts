/**
 * Calendar-day reads for jump to date (AGENTS.md §12.5: "days with
 * messages are marked").
 */
import type { ChatId } from '../../core/ids';
import { SECONDS_PER_DAY } from '../../core/dates';
import type { SqliteDatabase } from './open';
import { unpackIntegers } from './search-queries';

/**
 * Distinct calendar days that have messages in a chat, ascending, as day
 * numbers (`floor(ts_key / 86400)`, i.e. days since 1970-01-01 on the
 * export's wall clock). Served by idx_messages_chat_ts.
 *
 * @param db Open database.
 * @param chatId Chat to scan.
 * @returns Ascending day numbers.
 */
export function listMessageDays(db: SqliteDatabase, chatId: ChatId): readonly number[] {
  const rows = db.selectArrays(
    `SELECT group_concat(day, ',' ORDER BY day) FROM (
       SELECT DISTINCT ts_key / ? AS day FROM messages WHERE chat_id = ? ORDER BY day
     )`,
    [SECONDS_PER_DAY, chatId],
  );
  // One packed row instead of one bridge crossing per day (§17).
  return unpackIntegers(rows[0]?.[0]);
}
