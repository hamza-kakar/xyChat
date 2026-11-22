/**
 * Jump to date (AGENTS.md §12.5): a month calendar limited to the chat's
 * date range with days that have messages marked, plus first/last message
 * shortcuts. Picking a day jumps to its first message (findSeqByDate).
 */
import { useMemo, useState, type ReactNode } from 'react';
import {
  addMonths,
  compareMonths,
  dayNumberOfTsKey,
  formatDayNumber,
  formatMonthYear,
  formatWeekday,
  fromDayNumber,
  monthGrid,
  startOfCalendarDay,
  DAYS_IN_WEEK,
  type CalendarMonth,
} from '../../../core/dates';
import type { ChatId } from '../../../core/ids';
import { firstWeekday } from '../../../platform/week-start';
import { en } from '../../i18n/en';
import { formatString } from '../../i18n/format-string';
import { Sheet, SheetButton } from '../../components/sheet';
import { BackIcon, ForwardIcon } from '../../components/icons';
import { useFindSeqByDate, useMessageDays } from '../../queries/search-queries';

/** Props for {@link JumpToDateSheet}. */
export interface JumpToDateSheetProps {
  readonly chatId: ChatId;
  readonly firstTsKey: number;
  readonly lastTsKey: number;
  readonly total: number;
  readonly locale: string;
  readonly onJump: (seq: number) => void;
  readonly onClose: () => void;
}

function monthOf(day: number): CalendarMonth {
  const date = fromDayNumber(day);
  return { year: date.year, month: date.month };
}

export function JumpToDateSheet(props: JumpToDateSheetProps) {
  const { chatId, locale, onJump, onClose } = props;
  const firstMonth = monthOf(dayNumberOfTsKey(props.firstTsKey));
  const lastMonth = monthOf(dayNumberOfTsKey(props.lastTsKey));
  const [month, setMonth] = useState(lastMonth);
  const days = useMessageDays(chatId, true);
  const find = useFindSeqByDate(chatId);
  const withMessages = useMemo(() => new Set(days.data ?? []), [days.data]);
  const jump = (seq: number): void => {
    onJump(seq);
    onClose();
  };
  return (
    <Sheet open title={en.chatView.jumpTitle} closeLabel={en.chatView.close} onClose={onClose}>
      <div className="flex items-center justify-between">
        <MonthButton
          label={en.chatView.jumpPreviousMonth}
          disabled={compareMonths(month, firstMonth) <= 0}
          onClick={() => {
            setMonth(addMonths(month, -1));
          }}
        >
          <BackIcon className="h-5 w-5 rtl:-scale-x-100" />
        </MonthButton>
        <h3 aria-live="polite" className="text-text font-semibold">
          {formatMonthYear(month, locale)}
        </h3>
        <MonthButton
          label={en.chatView.jumpNextMonth}
          disabled={compareMonths(month, lastMonth) >= 0}
          onClick={() => {
            setMonth(addMonths(month, 1));
          }}
        >
          <ForwardIcon className="h-5 w-5 rtl:-scale-x-100" />
        </MonthButton>
      </div>
      <MonthTable
        month={month}
        locale={locale}
        withMessages={withMessages}
        disabled={find.isPending}
        onPick={(day) => {
          find.mutate(startOfCalendarDay(fromDayNumber(day)), {
            onSuccess: (seq) => {
              if (seq !== null) {
                jump(seq);
              }
            },
          });
        }}
      />
      {find.isError || days.isError ? (
        <p role="alert" className="text-danger text-sm">
          {en.chatView.jumpFailed}
        </p>
      ) : null}
      <SheetButton
        onClick={() => {
          jump(0);
        }}
      >
        {en.chatView.jumpFirst}
      </SheetButton>
      <SheetButton
        onClick={() => {
          jump(props.total - 1);
        }}
      >
        {en.chatView.jumpLast}
      </SheetButton>
    </Sheet>
  );
}

function MonthButton(props: {
  readonly label: string;
  readonly disabled: boolean;
  readonly onClick: () => void;
  readonly children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={props.label}
      disabled={props.disabled}
      className="text-accent flex min-h-11 min-w-11 items-center justify-center rounded-full disabled:opacity-40"
      onClick={props.onClick}
    >
      {props.children}
    </button>
  );
}

function MonthTable(props: {
  readonly month: CalendarMonth;
  readonly locale: string;
  readonly withMessages: ReadonlySet<number>;
  readonly disabled: boolean;
  readonly onPick: (day: number) => void;
}) {
  const { month, locale, withMessages } = props;
  const start = firstWeekday(locale);
  const weekdays = Array.from(
    { length: DAYS_IN_WEEK },
    (_unused, index) => ((start - 1 + index) % DAYS_IN_WEEK) + 1,
  );
  return (
    <table className="w-full table-fixed border-separate border-spacing-0.5 text-center">
      <thead>
        <tr>
          {weekdays.map((weekday) => (
            <th
              key={weekday}
              scope="col"
              abbr={formatWeekday(weekday, locale, 'long')}
              className="text-text-muted py-1 text-xs font-medium"
            >
              {formatWeekday(weekday, locale, 'narrow')}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {monthGrid(month, start).map((week) => (
          <tr key={week.find((slot) => slot !== null) ?? 0}>
            {week.map((day, index) => (
              <td key={day ?? `empty-${String(index)}`}>
                {day === null ? null : (
                  <DayButton
                    day={day}
                    locale={locale}
                    hasMessages={withMessages.has(day)}
                    disabled={props.disabled}
                    onPick={props.onPick}
                  />
                )}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function DayButton(props: {
  readonly day: number;
  readonly locale: string;
  readonly hasMessages: boolean;
  readonly disabled: boolean;
  readonly onPick: (day: number) => void;
}) {
  const { day, hasMessages } = props;
  const label = formatDayNumber(day, props.locale);
  return (
    <button
      type="button"
      disabled={!hasMessages || props.disabled}
      aria-label={hasMessages ? formatString(en.chatView.jumpDayLabel, { date: label }) : label}
      className={`flex min-h-11 w-full items-center justify-center rounded-full text-sm ${
        hasMessages ? 'bg-accent text-accent-contrast font-semibold' : 'text-text-muted'
      } disabled:cursor-default`}
      onClick={() => {
        props.onPick(day);
      }}
    >
      {fromDayNumber(day).day}
    </button>
  );
}
