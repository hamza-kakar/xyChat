/**
 * Repository contract: media gallery, links, durations, video thumbnails
 * and decoded-audio cache paths (§12.6, §13). Chromium against real
 * sqlite-wasm per ADR 0007.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { commitImport, type ImportCommitInput } from '../../src/storage/sqlite/import-commit';
import { createImportRecord } from '../../src/storage/sqlite/import-record';
import { asAttachmentId, asChatId, type ChatId } from '../../src/core/ids';
import type { MediaType, ParsedMessage } from '../../src/core/model';
import { openContractDb, recordInput } from './contract-helpers';
import type { SqliteDatabase } from '../../src/storage/sqlite/open';
import type { SqliteChatRepository } from '../../src/storage/sqlite/sqlite-repository';

let db: SqliteDatabase;
let repo: SqliteChatRepository;
let chatId: ChatId;

interface Spec {
  readonly kind: ParsedMessage['kind'];
  readonly body: string;
  readonly mediaType?: MediaType;
  readonly status?: 'present' | 'missing' | 'omitted';
  readonly author?: string;
}

const SPECS: readonly Spec[] = [
  { kind: 'text', body: 'see https://example.com/a and https://example.org/b' },
  { kind: 'media', body: '', mediaType: 'image', status: 'present' },
  { kind: 'media', body: 'clip', mediaType: 'video', status: 'present', author: 'Ali' },
  { kind: 'media', body: '', mediaType: 'voice', status: 'present' },
  { kind: 'media', body: '', mediaType: 'image', status: 'omitted' },
  { kind: 'text', body: 'no links here' },
  { kind: 'media', body: '', mediaType: 'sticker', status: 'present' },
  { kind: 'text', body: 'mail me at mailto:sara@example.com' },
  { kind: 'media', body: '', mediaType: 'image', status: 'missing' },
  { kind: 'media', body: '', mediaType: 'gif', status: 'present' },
];

function galleryInput(importId: string): ImportCommitInput {
  const messages = SPECS.map((spec, seq) => ({
    fingerprint: `fp-${String(seq)}`,
    message: {
      seq,
      sourceLine: seq + 1,
      timestamp: {
        year: 2026,
        month: 3 + Math.floor(seq / 5),
        day: 2,
        hour: 9,
        minute: seq,
        second: 0,
      },
      author: spec.author ?? 'Sara',
      kind: spec.kind,
      body: spec.body,
      isEdited: false,
      attachment:
        spec.mediaType === undefined
          ? null
          : {
              fileName: spec.status === 'omitted' ? null : `file-${String(seq)}`,
              mediaType: spec.mediaType,
              status: spec.status === 'omitted' ? ('omitted' as const) : ('referenced' as const),
            },
      poll: null,
      location: null,
    },
  }));
  const attachments = SPECS.flatMap((spec, seq) =>
    spec.mediaType === undefined
      ? []
      : [
          {
            id: `att-${String(seq)}`,
            fingerprintOfMessage: `fp-${String(seq)}`,
            fileName: spec.status === 'omitted' ? null : `file-${String(seq)}`,
            mediaType: spec.mediaType,
            mime: null,
            byteSize: spec.status === 'present' ? 100 : null,
            opfsPath: spec.status === 'present' ? `media/c/att-${String(seq)}.bin` : null,
            thumbPath: null,
            width: null,
            height: null,
            durationMs: null,
            status: spec.status ?? ('present' as const),
          },
        ],
  );
  return {
    importId,
    targetChatId: null,
    newChat: { title: 'Gallery', isGroup: false, sourcePlatform: 'ios', dateOrder: 'DMY' },
    messages,
    attachments,
    fileName: 'gallery.zip',
    fileBytes: 1000,
    parserVersion: '1.0.0',
  };
}

beforeEach(async () => {
  ({ db, repo } = await openContractDb());
  createImportRecord(db, recordInput('imp-g'));
  chatId = asChatId(commitImport(db, galleryInput('imp-g')).chatId);
});

afterEach(() => {
  db.close();
});

describe('repository contract: media gallery (§12.6)', () => {
  it('lists stored media of the requested types, newest first, with context', () => {
    const page = repo.listAttachments({
      chatId,
      types: ['image', 'sticker', 'gif'],
      cursor: null,
      limit: 50,
    });
    expect(page.items.map((item) => item.attachment.id)).toEqual(['att-9', 'att-6', 'att-1']);
    expect(page.nextCursor).toBeNull();
    const first = page.items[2];
    expect(first?.message.seq).toBe(1);
    expect(first?.message.tsLocal).toEqual({
      year: 2026,
      month: 3,
      day: 2,
      hour: 9,
      minute: 1,
      second: 0,
    });
    expect(first?.message.authorName).toBe('Sara');
    const videos = repo.listAttachments({ chatId, types: ['video'], cursor: null, limit: 50 });
    expect(videos.items[0]?.message.authorName).toBe('Ali');
    expect(repo.listAttachments({ chatId, types: [], cursor: null, limit: 50 }).items).toEqual([]);
  });

  it('pages by message seq', () => {
    const base = { chatId, types: ['image', 'sticker', 'gif'] as const, limit: 2 };
    const page1 = repo.listAttachments({ ...base, cursor: null });
    expect(page1.items.map((item) => item.message.seq)).toEqual([9, 6]);
    expect(page1.nextCursor).toBe(6);
    const page2 = repo.listAttachments({ ...base, cursor: page1.nextCursor });
    expect(page2.items.map((item) => item.message.seq)).toEqual([1]);
    expect(page2.nextCursor).toBeNull();
  });
});

describe('repository contract: links (§12.6)', () => {
  it('lists text messages with links, newest first, paged by seq', () => {
    const page = repo.listLinks({ chatId, cursor: null, limit: 50 });
    expect(page.messages.map((message) => message.seq)).toEqual([7, 0]);
    expect(page.messages[1]?.body).toContain('https://example.org/b');
    expect(page.messages[1]?.chatId).toBe(chatId);
    expect(page.nextCursor).toBeNull();
    const limited = repo.listLinks({ chatId, cursor: null, limit: 1 });
    expect(limited.nextCursor).toBe(7);
    const rest = repo.listLinks({ chatId, cursor: 7, limit: 1 });
    expect(rest.messages.map((message) => message.seq)).toEqual([0]);
  });
});

describe('repository contract: durations and video thumbnails (§13.2, §13.3)', () => {
  it('stores a duration only on stored audio', () => {
    repo.setAttachmentDuration(asAttachmentId('att-3'), 4200);
    repo.setAttachmentDuration(asAttachmentId('att-1'), 4200);
    expect(repo.getAttachment(asAttachmentId('att-3'))?.durationMs).toBe(4200);
    expect(repo.getAttachment(asAttachmentId('att-1'))?.durationMs).toBeNull();
    expect(repo.getAttachment(asAttachmentId('nope'))).toBeNull();
  });

  it('records a thumbnail only on stored videos and keeps a known size', () => {
    const input = { thumbPath: 'thumbs/c/x.jpg', width: 640, height: 360 };
    expect(repo.setVideoThumbnail({ ...input, attachmentId: asAttachmentId('att-2') })).toBe(true);
    const video = repo.getAttachment(asAttachmentId('att-2'));
    expect(video?.thumbPath).toBe('thumbs/c/x.jpg');
    expect(video?.width).toBe(640);
    expect(repo.setVideoThumbnail({ ...input, attachmentId: asAttachmentId('att-1') })).toBe(false);
    db.run('UPDATE attachments SET width = 10, height = 20 WHERE id = ?', ['att-9']);
    expect(repo.setVideoThumbnail({ ...input, attachmentId: asAttachmentId('att-9') })).toBe(true);
    expect(repo.getAttachment(asAttachmentId('att-9'))?.width).toBe(10);
  });
});

describe('repository contract: decoded-audio cache paths (§13.2)', () => {
  it('deletes a chat with its audio cache paths and keeps known ones out of orphans', () => {
    expect(repo.listChatMediaPaths(chatId)).toContain('cache/audio/att-3.wav');
    const orphans = repo.listOrphanMedia(['cache/audio/att-3.wav', 'cache/audio/gone.wav']);
    expect(orphans).toEqual(['cache/audio/gone.wav']);
  });
});
