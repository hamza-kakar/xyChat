import { initialsOf, paletteIndexFor } from './avatar-color';

/** Avatar circle: initials in the title's palette color. The
 * palette is AA on the raised surface in both themes (tokens.test.ts). */
export function Avatar({ title }: { readonly title: string }) {
  return (
    <span
      aria-hidden="true"
      className="bg-surface-raised border-border flex h-11 w-11 shrink-0 items-center justify-center rounded-full border text-sm font-semibold"
      style={{ color: `var(--name-${String(paletteIndexFor(title))})` }}
    >
      {initialsOf(title)}
    </span>
  );
}
