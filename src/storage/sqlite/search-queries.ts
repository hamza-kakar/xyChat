/**
 * Search and link queries (AGENTS.md §11, §12.6 Links tab). The only SQL
 * touching messages_fts lives here; user input is always escaped into an
 * FTS phrase or a LIKE with ESCAPE.
 */
import type { ChatId } from '../../core/ids';
import { messageFromRow } from './rows';
import type { SqliteDatabase } from './open';
import type { LinkPage, SearchPage, SearchQuery } from '../repository';

/** Escapes a LIKE query per §11 (1–2 char fallback path). */
function escapeLike(raw: string): string {
  return raw.replace(/[\\%_]/gu, (c) => `\\${c}`);
}

/** Wraps a search phrase for FTS MATCH (double internal quotes, §11). */
function ftsPhrase(raw: string): string {
  return `"${raw.replaceAll('"', '""')}"`;
}

/** Builds a snippet ±40 chars around the first match (§11). */
function buildSnippet(body: string, query: string): string {
  const index = body.toLowerCase().indexOf(query.toLowerCase());
  if (index < 0) {
    return body.length > 80 ? `${body.slice(0, 80)}…` : body;
  }
  const start = Math.max(0, index - 40);
  const end = Math.min(body.length, index + query.length + 40);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < body.length ? '…' : '';
  return `${prefix}${body.slice(start, end)}${suffix}`;
}

/**
 * Runs a search: FTS MATCH for 3+ char queries, LIKE fallback below (§11).
 * Results sort newest-first with keyset pagination.
 */
export function searchMessages(db: SqliteDatabase, q: SearchQuery): SearchPage {
  /** Full-text or LIKE search with filters and keyset paging (§11). */

  const conditions: string[] = [];
  const params: (string | number | null)[] = [];
  let joins = '';

  if (q.chatId !== null) {
    conditions.push('m.chat_id = ?');
    params.push(q.chatId);
  }
  if (q.authorId !== null) {
    conditions.push('m.author_id = ?');
    params.push(q.authorId);
  }
  if (q.kinds !== null && q.kinds.length > 0) {
    conditions.push(`m.kind IN (${q.kinds.map(() => '?').join(',')})`);
    params.push(...q.kinds);
  }
  if (q.dateFromTsKey !== null) {
    conditions.push('m.ts_key >= ?');
    params.push(q.dateFromTsKey);
  }
  if (q.dateToTsKey !== null) {
    conditions.push('m.ts_key <= ?');
    params.push(q.dateToTsKey);
  }
  if (q.cursor !== null) {
    conditions.push('(m.ts_key < ? OR (m.ts_key = ? AND m.id < ?))');
    params.push(q.cursor.tsKey, q.cursor.tsKey, q.cursor.rowId);
  }

  if (q.query.length >= 3) {
    joins = 'JOIN messages_fts f ON f.rowid = m.id';
    conditions.push('messages_fts MATCH ?');
    params.push(ftsPhrase(q.query));
  } else {
    // §11: 1–2 char queries skip FTS and use LIKE, in-chat only, capped
    // at 500 results.
    if (q.chatId === null || q.limit > 500) {
      conditions.push('1 = 0');
    } else {
      conditions.push("m.body LIKE ? ESCAPE '\\'");
      params.push(`%${escapeLike(q.query)}%`);
    }
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  // §11: global search sorts newest-first; in-chat search sorts by seq.
  const orderBy = q.chatId !== null ? 'm.seq ASC' : 'm.ts_key DESC, m.id DESC';
  const rows = db.selectObjects(
    `SELECT m.*, p.display_name AS author_name
     FROM messages m ${joins} LEFT JOIN participants p ON p.id = m.author_id
     ${where}
     ORDER BY ${orderBy}
     LIMIT ?`,
    [...params, q.limit],
  );

  const hits = rows.map((row) => {
    const message = messageFromRow(row);
    return {
      messageRowId: message.rowId,
      chatId: message.chatId,
      seq: message.seq,
      tsLocal: message.tsLocal,
      authorName: message.authorName,
      snippet: buildSnippet(message.body, q.query),
    };
  });
  const lastRow = rows.at(-1);
  const nextCursor =
    rows.length === q.limit && lastRow !== undefined && typeof lastRow['ts_key'] === 'number'
      ? { tsKey: lastRow['ts_key'], rowId: Number(lastRow['id']) }
      : null;
  return { hits, nextCursor };
}

/** Lists link-bearing text messages with extracted URLs (§12.6). */
export function listLinks(
  db: SqliteDatabase,
  q: { chatId: ChatId; cursor: number | null; limit: number },
): LinkPage {
  const conditions: string[] = ['m.chat_id = ?', "m.kind = 'text'", "m.body LIKE '%http%'"];
  const params: (string | number | null)[] = [q.chatId];
  if (q.cursor !== null) {
    conditions.push('m.id < ?');
    params.push(q.cursor);
  }
  const rows = db.selectObjects(
    `SELECT m.id, m.chat_id, m.body FROM messages m WHERE ${conditions.join(' AND ')} ORDER BY m.id DESC LIMIT ?`,
    [...params, q.limit],
  );
  const links = rows
    .map((row) => {
      const body = String(row['body']);
      const urlMatch = /https?:\/\/[^\s<>"]+/u.exec(body);
      return urlMatch === null
        ? null
        : {
            messageRowId: Number(row['id']),
            chatId: row['chat_id'] as LinkPage['links'][number]['chatId'],
            url: urlMatch[0],
            snippet: buildSnippet(body, urlMatch[0]),
          };
    })
    .filter((l): l is NonNullable<typeof l> => l !== null);
  const last = rows.at(-1);
  return {
    links,
    nextCursor: rows.length === q.limit && last !== undefined ? Number(last['id']) : null,
  };
}
