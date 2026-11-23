/** Combined fast-path matchers per locale (table-driven). */
import type { LocalePatterns } from './locale/types';

/** The union matchers for one locale, derived from its tables. */
export interface LocaleMatchers {
  readonly system: RegExp;
  readonly deleted: RegExp;
  readonly edited: RegExp;
  readonly omitted: RegExp;
  readonly calls: RegExp;
}

/** Builds the union matchers for a locale table. */
function buildMatchers(locale: LocalePatterns): LocaleMatchers {
  return {
    system: new RegExp(locale.system.map((re) => `(?:${re.source})`).join('|'), 'u'),
    deleted: new RegExp(locale.deleted.map((re) => `(?:${re.source})`).join('|'), 'u'),
    edited: new RegExp(locale.edited.map((re) => `(?:${re.source})`).join('|'), 'u'),
    omitted: new RegExp(locale.omitted.map((o) => `(?:${o.re.source})`).join('|'), 'u'),
    calls: new RegExp(locale.calls.map((re) => `(?:${re.source})`).join('|'), 'u'),
  };
}

const matcherCache = new Map<string, LocaleMatchers>();

/** Returns the cached matchers for a locale, building them on first use. */
export function matchersFor(locale: LocalePatterns): LocaleMatchers {
  let matchers = matcherCache.get(locale.id);
  if (matchers === undefined) {
    matchers = buildMatchers(locale);
    matcherCache.set(locale.id, matchers);
  }
  return matchers;
}
