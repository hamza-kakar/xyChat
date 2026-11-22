/**
 * First day of the week for a locale (AGENTS.md §12.5 calendar), from
 * `Intl.Locale` week info where the engine has it (`getWeekInfo()` or the
 * older `weekInfo` getter). Engines without it start weeks on Monday.
 */
import * as v from 'valibot';

/** ISO weekday used when the engine has no week data (Monday). */
const DEFAULT_FIRST_WEEKDAY = 1;

const WeekInfo = v.object({
  firstDay: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(7)),
});

/** Reads the engine's week info for `locale`, or undefined. */
function readWeekInfo(locale: Intl.Locale): unknown {
  const method: unknown = Reflect.get(locale, 'getWeekInfo');
  if (typeof method === 'function') {
    const info: unknown = Reflect.apply(method, locale, []);
    return info;
  }
  const getter: unknown = Reflect.get(locale, 'weekInfo');
  return getter;
}

/**
 * ISO weekday (1 = Monday … 7 = Sunday) that starts the week in `locale`.
 *
 * @param locale BCP-47 tag, e.g. navigator.language.
 */
export function firstWeekday(locale: string): number {
  try {
    const parsed = v.safeParse(WeekInfo, readWeekInfo(new Intl.Locale(locale)));
    return parsed.success ? parsed.output.firstDay : DEFAULT_FIRST_WEEKDAY;
  } catch {
    // An invalid tag throws RangeError; fall back like an engine without data.
    return DEFAULT_FIRST_WEEKDAY;
  }
}
