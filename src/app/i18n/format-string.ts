import { en } from './en';

/**
 * Tiny `{placeholder}` interpolation for i18n strings. Keeps interpolation
 * out of call sites and avoids pulling in a dependency.
 */

/** Replaces every `{key}` in the template with the matching param. */
export function formatString(
  template: string,
  params: Readonly<Record<string, string | number>>,
): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = params[key];
    return value === undefined ? match : String(value);
  });
}

/** Picks the singular or plural template for a count and fills it in
 * (`{count}` gets the locale-formatted number). English needs two forms. */
export function formatCount(
  count: number,
  templates: { readonly one: string; readonly other: string },
  params: Readonly<Record<string, string | number>> = {},
): string {
  return formatString(count === 1 ? templates.one : templates.other, {
    ...params,
    count: count.toLocaleString(),
  });
}

/** Binary byte formatting for §12.8 summaries (1 decimal on MB/GB). */
export function formatBytes(bytes: number): string {
  const gib = bytes / 1024 ** 3;
  if (gib >= 1) {
    return formatString(en.byteUnits.gb, { count: Number(gib.toFixed(1)) });
  }
  const mib = bytes / 1024 ** 2;
  if (mib >= 1) {
    return formatString(en.byteUnits.mb, { count: Number(mib.toFixed(1)) });
  }
  const kib = bytes / 1024;
  if (kib >= 1) {
    return formatString(en.byteUnits.kb, { count: Math.round(kib) });
  }
  return formatString(en.byteUnits.b, { count: bytes });
}
