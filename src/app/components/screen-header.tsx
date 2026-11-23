/**
 * A sub-screen header: a back link and the page
 * heading, which takes focus when the screen opens.
 */
import { Link } from 'react-router';
import { BackIcon } from './icons';
import { useFocusHeading } from '../hooks/use-focus-heading';

/** Props for {@link ScreenHeader}. */
export interface ScreenHeaderProps {
  readonly title: string;
  readonly backTo: string;
  readonly backLabel: string;
}

export function ScreenHeader({ title, backTo, backLabel }: ScreenHeaderProps) {
  const headingRef = useFocusHeading<HTMLHeadingElement>();
  return (
    <header className="border-border bg-surface safe-top border-b">
      <div className="flex items-center gap-1 py-1 ps-1 pe-4">
        <Link
          to={backTo}
          aria-label={backLabel}
          className="text-accent flex min-h-11 min-w-11 items-center justify-center rounded-full"
        >
          <BackIcon className="h-6 w-6 rtl:-scale-x-100" />
        </Link>
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="text-text truncate ps-2 text-lg font-semibold outline-none"
          dir="auto"
        >
          {title}
        </h1>
      </div>
    </header>
  );
}
