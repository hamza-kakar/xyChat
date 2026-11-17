/**
 * Chat metadata derived from an export file (AGENTS.md §8.9): the title from
 * the archive or .txt file name, and the group heuristic. Self ("me") is
 * never guessed — the user chooses it in the import flow (§12.8).
 */

/** File-name patterns seen in real exports (iOS drops "with"). */
const IOS_TITLE = /^WhatsApp Chat - (.+)\.(zip|txt)$/u;
const ANDROID_TITLE = /^WhatsApp Chat with (.+)\.(zip|txt)$/u;

/** Derived metadata for the import confirmation screen. */
export interface ChatMeta {
  /** Editable title (pre-filled from the file name). */
  readonly title: string;
  /** True when the participants/events suggest a group chat. */
  readonly isGroup: boolean;
}

/**
 * Derives the chat title from a file name.
 *
 * @param fileName The uploaded file's name (`.zip` or `.txt`).
 * @returns The captured title, or the file name without extension as the
 *   fallback.
 * @example
 * titleFromFileName('WhatsApp Chat - Family.zip'); // 'Family'
 * titleFromFileName('WhatsApp Chat with Sara.txt'); // 'Sara'
 * titleFromFileName('random.txt'); // 'random'
 */
export function titleFromFileName(fileName: string): string {
  const ios = IOS_TITLE.exec(fileName);
  if (ios !== null) {
    return ios[1] ?? fileName;
  }
  const android = ANDROID_TITLE.exec(fileName);
  if (android !== null) {
    return android[1] ?? fileName;
  }
  const dot = fileName.lastIndexOf('.');
  return dot > 0 ? fileName.slice(0, dot) : fileName;
}

/** System events that only occur in group chats. */
const GROUP_EVENT_PATTERNS: readonly RegExp[] = [
  / created group /u,
  / added /u,
  / removed /u,
  / left$/u,
  / changed the subject from /u,
  / changed this group/u,
  / changed the group description/u,
  / joined the group /u,
];

/**
 * Decides the group heuristic (§8.9): more than two distinct authors, or any
 * group-only system event, means a group chat.
 *
 * @param authors Distinct author names from the parse.
 * @param systemBodies All system message bodies from the parse.
 */
export function isGroupChat(authors: readonly string[], systemBodies: readonly string[]): boolean {
  if (authors.length > 2) {
    return true;
  }
  return systemBodies.some((body) => GROUP_EVENT_PATTERNS.some((re) => re.test(body)));
}
