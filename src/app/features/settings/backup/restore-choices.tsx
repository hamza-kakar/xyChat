/**
 * The restore preview: the backup's chats, each with
 * its choice. A chat that matches one on this device can merge (the
 * default: nothing is lost), replace it, or be skipped; any other chat is
 * restored or skipped.
 */
import { en } from '../../../i18n/en';
import { formatCount, formatString } from '../../../i18n/format-string';
import type { RestorePreviewChatView, RestorePreviewView } from '../../../../client/db-client';
import type { ChoiceMap, RestoreChoice } from './restore-decisions';

/** The options offered for one chat, with their labels. */
function optionsFor(chat: RestorePreviewChatView): readonly [RestoreChoice, string][] {
  if (chat.match === null) {
    return [
      ['new', en.backup.choiceNew],
      ['skip', en.backup.choiceSkip],
    ];
  }
  const title = chat.match.title;
  return [
    ['merge', formatString(en.backup.choiceMerge, { title })],
    ['replace', formatString(en.backup.choiceReplace, { title })],
    ['skip', en.backup.choiceSkip],
  ];
}

function ChatChoice({
  chat,
  choice,
  onChoose,
}: {
  readonly chat: RestorePreviewChatView;
  readonly choice: RestoreChoice;
  readonly onChoose: (choice: RestoreChoice) => void;
}) {
  return (
    <fieldset className="border-border flex flex-col gap-1 rounded-lg border px-3 py-2">
      <legend className="text-text px-1 font-semibold" dir="auto">
        {chat.title}
      </legend>
      <p className="text-text-muted text-sm">
        {formatCount(chat.messageCount, en.backup.chatMessages)} ·{' '}
        {formatCount(chat.mediaCount, en.backup.chatMedia)}
      </p>
      {optionsFor(chat).map(([value, label]) => (
        <label key={value} className="text-text flex min-h-11 items-center gap-3" dir="auto">
          <input
            type="radio"
            name={`restore-${chat.backupChatId}`}
            value={value}
            checked={choice === value}
            className="accent-accent size-5"
            onChange={() => {
              onChoose(value);
            }}
          />
          {label}
        </label>
      ))}
      {choice === 'replace' ? (
        <p className="text-danger text-sm">{en.backup.replaceWarning}</p>
      ) : null}
    </fieldset>
  );
}

/** Props for {@link RestoreChoices}. */
export interface RestoreChoicesProps {
  readonly preview: RestorePreviewView;
  readonly choices: ChoiceMap;
  readonly onChange: (choices: ChoiceMap) => void;
  readonly onRestore: () => void;
}

export function RestoreChoices({ preview, choices, onChange, onRestore }: RestoreChoicesProps) {
  const createdAt = new Intl.DateTimeFormat(navigator.language, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(preview.createdAt));
  const anyChosen = [...choices.values()].some((choice) => choice !== 'skip');
  return (
    <div className="flex flex-col gap-3">
      <p className="text-text text-sm">
        {formatString(en.backup.previewSummary, {
          date: createdAt,
          version: preview.appVersion,
        })}{' '}
        {preview.includesMedia ? en.backup.previewWithMedia : en.backup.previewWithoutMedia}
      </p>
      {preview.chats.map((chat) => (
        <ChatChoice
          key={chat.backupChatId}
          chat={chat}
          choice={choices.get(chat.backupChatId) ?? 'skip'}
          onChoose={(choice) => {
            onChange(new Map(choices).set(chat.backupChatId, choice));
          }}
        />
      ))}
      <button
        type="button"
        disabled={!anyChosen}
        className="bg-accent text-accent-contrast min-h-11 rounded-lg px-4 font-semibold disabled:opacity-60"
        onClick={onRestore}
      >
        {en.backup.restore}
      </button>
    </div>
  );
}
