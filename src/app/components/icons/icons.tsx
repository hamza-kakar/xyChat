/**
 * Original inline SVG icons (AGENTS.md §4.2: no icon fonts). Decorative by
 * default (`aria-hidden`); the surrounding control carries the label.
 * Strokes use currentColor so icons follow the text token.
 */
import type { ReactNode } from 'react';

/** Props shared by every icon. */
export interface IconProps {
  readonly className?: string;
}

function Svg({ className, children }: IconProps & { readonly children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ?? 'h-5 w-5'}
    >
      {children}
    </svg>
  );
}

/** Back chevron; mirrored under RTL by the caller (`rtl:-scale-x-100`). */
export function BackIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M15 5l-7 7 7 7" />
    </Svg>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  );
}

export function MoreIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="5" cy="12" r="1.2" />
      <circle cx="12" cy="12" r="1.2" />
      <circle cx="19" cy="12" r="1.2" />
    </Svg>
  );
}

export function GroupIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="9" cy="9" r="3" />
      <path d="M3.5 19c.8-3 3-4.5 5.5-4.5s4.7 1.5 5.5 4.5" />
      <path d="M15.5 6.5a3 3 0 010 5.5M17 14.8c1.8.6 3 2 3.5 4.2" />
    </Svg>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 6l12 12M18 6L6 18" />
    </Svg>
  );
}

export function PhotoIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3.5" y="5" width="17" height="14" rx="2.5" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="M4 17l5-4.5 3.5 3 3-2.5 4.5 4" />
    </Svg>
  );
}

export function VideoIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="6" width="13" height="12" rx="2.5" />
      <path d="M16 10.5l5-3v9l-5-3" />
    </Svg>
  );
}

export function MicIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="9" y="3.5" width="6" height="11" rx="3" />
      <path d="M5.5 11.5a6.5 6.5 0 0013 0M12 18v2.5" />
    </Svg>
  );
}

export function DocumentIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M7 3.5h7l4.5 4.5v12.5H7z" />
      <path d="M14 3.5V8h4.5M9.5 13h6M9.5 16.5h6" />
    </Svg>
  );
}

export function ContactIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="9" r="3.5" />
      <path d="M5 20c1-3.5 3.8-5.5 7-5.5s6 2 7 5.5" />
    </Svg>
  );
}

export function PhoneIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6.5 3.5h3l1.5 4-2 1.5a11 11 0 006 6l1.5-2 4 1.5v3a2 2 0 01-2 2A16.5 16.5 0 014.5 5.5a2 2 0 012-2z" />
    </Svg>
  );
}

export function PinIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0113 0c0 5-6.5 11-6.5 11z" />
      <circle cx="12" cy="10" r="2.3" />
    </Svg>
  );
}

export function PollIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5 20V11M12 20V5M19 20v-6" />
    </Svg>
  );
}

export function BlockedIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="8" />
      <path d="M6.5 6.5l11 11" />
    </Svg>
  );
}

export function ShareIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 15V4M8 8l4-4 4 4" />
      <path d="M6 12v7.5h12V12" />
    </Svg>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="10.5" cy="10.5" r="6" />
      <path d="M15 15l5 5" />
    </Svg>
  );
}

export function BookmarkIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M7 4h10v16l-5-3.5L7 20z" />
    </Svg>
  );
}

export function CalendarIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="4" y="5.5" width="16" height="14.5" rx="2.5" />
      <path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" />
    </Svg>
  );
}

export function ChevronUpIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 15l6-6 6 6" />
    </Svg>
  );
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 9l6 6 6-6" />
    </Svg>
  );
}

/** Forward chevron; mirrored under RTL by the caller (`rtl:-scale-x-100`). */
export function ForwardIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M9 5l7 7-7 7" />
    </Svg>
  );
}
