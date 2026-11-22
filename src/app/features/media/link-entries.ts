/**
 * Links tab entries (AGENTS.md §12.6): every allowed link of each message,
 * with its domain (or address, for mail and phone links) and the message
 * it came from.
 */
import { extractLinks } from '../../components/linkify';
import type { LinkMessageView } from '../../../client/db-client';

/** One link in the Links tab. */
export interface LinkEntry {
  readonly key: string;
  readonly href: string;
  readonly text: string;
  readonly domain: string;
  readonly message: LinkMessageView;
}

/**
 * The host of a web link, or the address of a mail or phone link.
 *
 * @param href An allowed link target.
 * @returns E.g. "example.com" or "someone@example.com".
 */
export function linkDomain(href: string): string {
  try {
    const url = new URL(href);
    return url.hostname === '' ? decodeURIComponent(url.pathname) : url.hostname;
  } catch {
    return href;
  }
}

/**
 * Expands link-bearing messages into one entry per link, keeping order.
 *
 * @param messages Messages newest first.
 * @returns Entries newest first; a message's links in text order.
 */
export function linkEntries(messages: readonly LinkMessageView[]): readonly LinkEntry[] {
  return messages.flatMap((message) =>
    extractLinks(message.body).map((link, position) => ({
      key: `${String(message.messageRowId)}-${String(position)}`,
      href: link.href,
      text: link.text,
      domain: linkDomain(link.href),
      message,
    })),
  );
}
