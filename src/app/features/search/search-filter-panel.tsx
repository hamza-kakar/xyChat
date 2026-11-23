/**
 * Filter controls for global search: chat, sender (once a
 * chat is chosen), message kinds and a date range.
 */
import { useId } from 'react';
import { asChatId, asParticipantId } from '../../../core/ids';
import { en } from '../../i18n/en';
import { useChats, useParticipants } from '../../queries/chat-queries';
import type { ChatId } from '../../../core/ids';
import { EMPTY_FILTERS, FILTER_KINDS, hasFilters, type FilterState } from './search-filters';

/** Props for {@link SearchFilterPanel}. */
export interface SearchFilterPanelProps {
  readonly state: FilterState;
  readonly onChange: (state: FilterState) => void;
}

const fieldClass = 'border-border bg-surface-raised text-text min-h-11 rounded-lg border px-3';

export function SearchFilterPanel({ state, onChange }: SearchFilterPanelProps) {
  const chats = useChats();
  const fromId = useId();
  const toId = useId();
  return (
    <details className="border-border border-b px-4 py-2" open={hasFilters(state)}>
      <summary className="text-accent flex min-h-11 cursor-pointer items-center font-semibold">
        {en.search.filtersHeading}
      </summary>
      <div className="flex flex-col gap-3 pb-2">
        <label className="flex flex-col gap-1 text-sm">
          {en.search.chatFilter}
          <select
            value={state.chatId ?? ''}
            className={fieldClass}
            onChange={(event) => {
              const value = event.target.value;
              onChange({ ...state, chatId: value === '' ? null : asChatId(value), authorId: null });
            }}
          >
            <option value="">{en.search.allChats}</option>
            {(chats.data ?? []).map((chat) => (
              <option key={chat.id} value={chat.id}>
                {chat.title}
              </option>
            ))}
          </select>
        </label>
        {state.chatId === null ? (
          <p className="text-text-muted text-sm">{en.search.senderNeedsChat}</p>
        ) : (
          <SenderSelect chatId={state.chatId} state={state} onChange={onChange} />
        )}
        <fieldset className="flex flex-col gap-1 text-sm">
          <legend className="mb-1">{en.search.kindFilter}</legend>
          <div className="flex flex-wrap gap-x-4">
            {FILTER_KINDS.map((kind) => (
              <label key={kind} className="flex min-h-11 items-center gap-2">
                <input
                  type="checkbox"
                  className="h-5 w-5"
                  checked={state.kinds.includes(kind)}
                  onChange={(event) => {
                    const kinds = event.target.checked
                      ? [...state.kinds, kind]
                      : state.kinds.filter((item) => item !== kind);
                    onChange({ ...state, kinds });
                  }}
                />
                {en.chatView.kindLabels[kind]}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="flex flex-wrap gap-3 text-sm">
          <label htmlFor={fromId} className="flex flex-col gap-1">
            {en.search.fromFilter}
            <input
              id={fromId}
              type="date"
              value={state.from}
              className={fieldClass}
              onChange={(event) => {
                onChange({ ...state, from: event.target.value });
              }}
            />
          </label>
          <label htmlFor={toId} className="flex flex-col gap-1">
            {en.search.toFilter}
            <input
              id={toId}
              type="date"
              value={state.to}
              className={fieldClass}
              onChange={(event) => {
                onChange({ ...state, to: event.target.value });
              }}
            />
          </label>
        </div>
        {hasFilters(state) ? (
          <button
            type="button"
            className="text-accent min-h-11 self-start rounded-lg px-3 font-semibold"
            onClick={() => {
              onChange(EMPTY_FILTERS);
            }}
          >
            {en.search.clearFilters}
          </button>
        ) : null}
      </div>
    </details>
  );
}

function SenderSelect({
  chatId,
  state,
  onChange,
}: {
  readonly chatId: ChatId;
  readonly state: FilterState;
  readonly onChange: (state: FilterState) => void;
}) {
  const participants = useParticipants(chatId);
  return (
    <label className="flex flex-col gap-1 text-sm">
      {en.search.senderFilter}
      <select
        value={state.authorId ?? ''}
        className={fieldClass}
        onChange={(event) => {
          const value = event.target.value;
          onChange({ ...state, authorId: value === '' ? null : asParticipantId(value) });
        }}
      >
        <option value="">{en.search.anySender}</option>
        {(participants.data ?? []).map((participant) => (
          <option key={participant.id} value={participant.id}>
            {participant.displayName}
          </option>
        ))}
      </select>
    </label>
  );
}
