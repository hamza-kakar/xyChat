/**
 * Search queries. The only SQL touching messages_fts
 * lives here; user input is always escaped into an FTS phrase or a LIKE
 * with ESCAPE.
 */
import { messageFromRow } from './rows';
import type { SqliteDatabase } from './open';
import type { InChatSearchQuery, MatchingSeqs, SearchPage, SearchQuery } from '../repository';

/**  LIKE fallback result cap (in-chat, 1–2 char queries). */
const LIKE_RESULT_CAP = 500;
/** In-chat navigation keeps at most this many FTS matches ("12 of
 * 87"); a chat with more shows the capped count with a "+". */
export const IN_CHAT_MATCH_CAP = 10_000;

/** Escapes a LIKE query (1–2 char fallback path). */
function escapeLike(raw: string): string {
  return raw.replace(/[\\%_]/gu, (c) => `\\${c}`);
}

/** Wraps a search phrase for FTS MATCH (double internal quotes). */
function ftsPhrase(raw: string): string {
  return `"${raw.replaceAll('"', '""')}"`;
}

/** Builds a snippet ±40 chars around the first match. */
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

/** Parses a `group_concat` of integers ('' or NULL when nothing matched). */
export function unpackIntegers(packed: unknown): number[] {
  return typeof packed === 'string' && packed !== '' ? packed.split(',').map(Number) : [];
}

/** WHERE fragments + parameters for one search (filters, keyset, mode). */
interface SearchConditions {
  readonly conditions: readonly string[];
  readonly params: readonly (string | number | null)[];
  readonly joins: string;
  readonly effectiveLimit: number;
}

/** Builds the WHERE conditions for a search: filters first, then the
 * keyset cursor (matching the ordering), then the FTS/LIKE mode. */
function searchConditions(q: SearchQuery): SearchConditions {
  const conditions: string[] = [];
  const params: (string | number | null)[] = [];
  let joins = '';
  const inChat = q.chatId !== null;

  if (inChat) {
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
    //  keyset: the cursor matches the ordering — in-chat pages forward by
    // seq, global pages backward by ts_key (rowid breaks ties in both).
    if (inChat) {
      conditions.push('(m.seq > ? OR (m.seq = ? AND m.id > ?))');
      params.push(q.cursor.seq, q.cursor.seq, q.cursor.rowId);
    } else {
      conditions.push('(m.ts_key < ? OR (m.ts_key = ? AND m.id < ?))');
      params.push(q.cursor.tsKey, q.cursor.tsKey, q.cursor.rowId);
    }
  }

  if (q.query.length >= 3) {
    joins = 'JOIN messages_fts f ON f.rowid = m.id';
    conditions.push('messages_fts MATCH ?');
    params.push(ftsPhrase(q.query));
  } else {
    //  1–2 char queries skip FTS and use LIKE, in-chat only.
    if (!inChat) {
      conditions.push('1 = 0');
    } else {
      conditions.push("m.body LIKE ? ESCAPE '\\'");
      params.push(`%${escapeLike(q.query)}%`);
    }
  }

  //  the LIKE fallback is limited to 500 results — cap the limit rather
  // than refusing the query.
  const effectiveLimit =
    inChat && q.query.length < 3 ? Math.min(q.limit, LIKE_RESULT_CAP) : q.limit;
  return { conditions, params, joins, effectiveLimit };
}

/**
 * Runs a search: FTS MATCH for 3+ char queries, LIKE fallback below.
 * Global results sort newest-first; in-chat results sort by seq — each with
 * its own keyset pagination.
 */
export function searchMessages(db: SqliteDatabase, q: SearchQuery): SearchPage {
  const { conditions, params, joins, effectiveLimit } = searchConditions(q);
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  //  global search sorts newest-first; in-chat search sorts by seq.
  const orderBy = q.chatId !== null ? 'm.seq ASC, m.id ASC' : 'm.ts_key DESC, m.id DESC';
  const rows = db.selectObjects(
    `SELECT m.*, p.display_name AS author_name
     FROM messages m ${joins} LEFT JOIN participants p ON p.id = m.author_id
     ${where}
     ORDER BY ${orderBy}
     LIMIT ?`,
    [...params, effectiveLimit],
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
    rows.length === effectiveLimit && lastRow !== undefined && typeof lastRow['ts_key'] === 'number'
      ? { tsKey: lastRow['ts_key'], rowId: Number(lastRow['id']), seq: Number(lastRow['seq']) }
      : null;
  return { hits, nextCursor };
}

/**
 * Every matching seq of an in-chat search, ascending (in-chat
 * navigation: the counter and next/previous need the full ordered list,
 * not a page of snippets). FTS matches stop at IN_CHAT_MATCH_CAP, the 1–2
 * char LIKE fallback at its 500-result cap.
 */
export function listMatchingSeqs(db: SqliteDatabase, q: InChatSearchQuery): MatchingSeqs {
  const cap = q.query.length < 3 ? LIKE_RESULT_CAP : IN_CHAT_MATCH_CAP;
  const { conditions, params, joins } = searchConditions({ ...q, limit: cap, cursor: null });
  // One packed row: per-row results cost a wasm-bridge crossing each,
  // which dominated large match lists.
  const rows = db.selectArrays(
    `SELECT group_concat(seq, ',' ORDER BY seq) FROM (
       SELECT m.seq FROM messages m ${joins}
       WHERE ${conditions.join(' AND ')}
       ORDER BY m.seq ASC
       LIMIT ?
     )`,
    [...params, cap + 1],
  );
  const all = unpackIntegers(rows[0]?.[0]);
  const seqs = all.slice(0, cap);
  return { seqs, isCapped: all.length > cap };
}
