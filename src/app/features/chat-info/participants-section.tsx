/**
 * Chat info: participants with their message counts as a CSS bar chart
 * (no chart library), and the "This is me" choice (§12.7).
 */
import { en } from '../../i18n/en';
import { formatString } from '../../i18n/format-string';
import { SettingsSection } from '../../components/settings-section';
import { useParticipants, useSetSelf } from '../../queries/chat-queries';
import type { ChatId, ParticipantId } from '../../../core/ids';

/** Props for {@link ParticipantsSection}. */
export interface ParticipantsSectionProps {
  readonly chatId: ChatId;
  readonly selfId: ParticipantId | null;
}

const PERCENT = 100;

export function ParticipantsSection({ chatId, selfId }: ParticipantsSectionProps) {
  const participants = useParticipants(chatId);
  const setSelf = useSetSelf();
  if (participants.data === undefined) {
    return null;
  }
  const sorted = [...participants.data].sort((a, b) => b.messageCount - a.messageCount);
  const most = Math.max(1, ...sorted.map((person) => person.messageCount));
  const choose = (participantId: ParticipantId | null): void => {
    setSelf.mutate({ chatId, participantId });
  };
  return (
    <>
      <SettingsSection heading={en.chatInfo.participantsHeading}>
        <ul className="flex flex-col gap-3">
          {sorted.map((person) => (
            <li
              key={person.id}
              aria-label={formatString(en.chatInfo.participantShare, {
                name: person.displayName,
                count: person.messageCount.toLocaleString(),
              })}
              className="flex flex-col gap-1"
            >
              <div className="flex justify-between gap-3 text-sm" aria-hidden="true">
                <span className="text-text truncate" dir="auto">
                  {person.displayName}
                </span>
                <span className="text-text-muted shrink-0">
                  {formatString(en.chatInfo.participantCount, {
                    count: person.messageCount.toLocaleString(),
                  })}
                </span>
              </div>
              <div
                className="bg-surface-raised h-2 overflow-hidden rounded-full"
                aria-hidden="true"
              >
                <div
                  className="bg-accent h-full rounded-full"
                  style={{ inlineSize: `${String((person.messageCount / most) * PERCENT)}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      </SettingsSection>
      <SettingsSection heading={en.chatInfo.selfHeading}>
        <fieldset className="flex flex-col gap-1">
          <legend className="sr-only">{en.chatInfo.selfHeading}</legend>
          {sorted.map((person) => (
            <label key={person.id} className="text-text flex min-h-11 items-center gap-3">
              <input
                type="radio"
                name="self"
                checked={selfId === person.id}
                disabled={setSelf.isPending}
                className="accent-accent h-5 w-5"
                onChange={() => {
                  choose(person.id);
                }}
              />
              <span dir="auto">{person.displayName}</span>
            </label>
          ))}
          <label className="text-text flex min-h-11 items-center gap-3">
            <input
              type="radio"
              name="self"
              checked={selfId === null}
              disabled={setSelf.isPending}
              className="accent-accent h-5 w-5"
              onChange={() => {
                choose(null);
              }}
            />
            {en.chatInfo.selfNone}
          </label>
        </fieldset>
        {setSelf.isError ? (
          <p role="alert" className="text-danger text-sm">
            {en.chatActions.actionFailed}
          </p>
        ) : null}
      </SettingsSection>
    </>
  );
}
