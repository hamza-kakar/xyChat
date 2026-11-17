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
