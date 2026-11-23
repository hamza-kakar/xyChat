/**
 * Search filter state and its mapping onto a worker query (chat, sender, kinds, date range). Dates come from `<input type="date">`
 * as `YYYY-MM-DD` on the export's wall clock.
 */
import * as v from 'valibot';
import { dayNumber, dayTsKeyRange } from '../../../core/dates';
import type { ChatId, ParticipantId } from '../../../core/ids';
import type { MessageKind } from '../../../core/model';
import type { SearchFilters } from '../../queries/search-queries';

/** Filter fields the user edits. */
export interface FilterState {
  readonly chatId: ChatId | null;
  readonly authorId: ParticipantId | null;
  readonly kinds: readonly MessageKind[];
  /** `YYYY-MM-DD` or ''. */
  readonly from: string;
  /** `YYYY-MM-DD` or ''. */
  readonly to: string;
}

/** No filters. */
export const EMPTY_FILTERS: FilterState = {
  chatId: null,
  authorId: null,
  kinds: [],
  from: '',
  to: '',
};

/** Kinds offered as filters, in display order. */
export const FILTER_KINDS: readonly MessageKind[] = [
  'text',
  'media',
  'location',
  'contact',
  'poll',
  'call',
  'deleted',
  'system',
];

const IsoDate = v.pipe(
  v.string(),
  v.regex(/^\d{4}-\d{2}-\d{2}$/u),
  v.transform((text) => {
    const [year = 0, month = 0, day = 0] = text.split('-').map(Number);
    return dayNumber({ year, month, day });
  }),
);

/** Day number of a `YYYY-MM-DD` field, or null when empty or invalid. */
export function parseDateField(text: string): number | null {
  const parsed = v.safeParse(IsoDate, text);
  return parsed.success ? parsed.output : null;
}

/** True when any filter is set. */
export function hasFilters(state: FilterState): boolean {
  return (
    state.chatId !== null ||
    state.authorId !== null ||
    state.kinds.length > 0 ||
    state.from !== '' ||
    state.to !== ''
  );
}

/** The worker query for a search text and filter state. */
export function toSearchFilters(query: string, state: FilterState): SearchFilters {
  const from = parseDateField(state.from);
  const to = parseDateField(state.to);
  return {
    query,
    chatId: state.chatId,
    authorId: state.chatId === null ? null : state.authorId,
    kinds: state.kinds.length === 0 ? null : state.kinds,
    dateFromTsKey: from === null ? null : dayTsKeyRange(from).from,
    dateToTsKey: to === null ? null : dayTsKeyRange(to).to,
  };
}
