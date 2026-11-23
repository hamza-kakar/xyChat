import { describe, expect, it } from 'vitest';
import { backupFileName, buildManifest, parseManifest } from './backup-manifest';

describe('backup manifest', () => {
  it('names archives after the app and the local time', () => {
    expect(backupFileName('xyChat', new Date(2026, 0, 2, 3, 4))).toBe(
      'xychat-backup-20260102-0304.zip',
    );
    expect(backupFileName('!!', new Date(2026, 10, 23, 23, 59))).toBe(
      'chats-backup-20261123-2359.zip',
    );
  });

  it('round-trips a manifest and rejects anything else', () => {
    const manifest = buildManifest({
      app: 'xyChat',
      appVersion: '0.1.0',
      schemaVersion: 2,
      createdAt: new Date(Date.UTC(2026, 10, 23, 9, 5)),
      chats: [{ id: 'c', title: 'T', messageCount: 3, mediaCount: 1, firstTsKey: 1, lastTsKey: 2 }],
      includesMedia: true,
    });
    expect(parseManifest(JSON.stringify(manifest))).toEqual(manifest);
    expect(manifest.createdAt).toBe('2026-11-23T09:05:00.000Z');
    expect(parseManifest('{')).toBeNull();
    expect(parseManifest(JSON.stringify({ ...manifest, schemaVersion: 0 }))).toBeNull();
    expect(parseManifest(JSON.stringify({ ...manifest, chats: 'all' }))).toBeNull();
  });
});
