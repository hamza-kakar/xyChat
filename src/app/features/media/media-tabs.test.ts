import { describe, expect, it } from 'vitest';
import { isGridTab, parseTab, TAB_TYPES } from './media-tabs';

describe('gallery tabs (§12.6)', () => {
  it('parses ?tab= and falls back to photos', () => {
    expect(parseTab('videos')).toBe('videos');
    expect(parseTab('links')).toBe('links');
    expect(parseTab(null)).toBe('photos');
    expect(parseTab('<script>')).toBe('photos');
  });

  it('puts stickers and GIFs under photos and voice under audio', () => {
    expect(TAB_TYPES.photos).toEqual(['image', 'sticker', 'gif']);
    expect(TAB_TYPES.audio).toContain('voice');
    expect(isGridTab('photos')).toBe(true);
    expect(isGridTab('docs')).toBe(false);
  });
});
