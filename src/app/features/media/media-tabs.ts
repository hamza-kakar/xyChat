/**
 * Gallery tabs: which media types each tab lists, and
 * the validated `?tab=` parameter.
 */
import * as v from 'valibot';
import type { MediaType } from '../../../core/model';

/** Tabs in display order. */
export const MEDIA_TABS = ['photos', 'videos', 'audio', 'docs', 'links'] as const;

/** One gallery tab. */
export type MediaTab = (typeof MEDIA_TABS)[number];

/** A tab that lists stored files (every tab but Links). */
export type FileTab = Exclude<MediaTab, 'links'>;

/** Media types per file tab: Photos include stickers and GIFs. */
export const TAB_TYPES: Readonly<Record<FileTab, readonly MediaType[]>> = {
  photos: ['image', 'sticker', 'gif'],
  videos: ['video'],
  audio: ['voice', 'audio'],
  docs: ['document', 'contact-card', 'other'],
};

const TabParam = v.picklist(MEDIA_TABS);

/**
 * The tab named by `?tab=`, defaulting to Photos for a missing or unknown
 * value.
 *
 * @param raw The raw query value.
 * @returns A valid tab.
 */
export function parseTab(raw: string | null): MediaTab {
  const parsed = v.safeParse(TabParam, raw);
  return parsed.success ? parsed.output : 'photos';
}

/** True when the tab shows a thumbnail grid rather than a list. */
export function isGridTab(tab: MediaTab): tab is 'photos' | 'videos' {
  return tab === 'photos' || tab === 'videos';
}
