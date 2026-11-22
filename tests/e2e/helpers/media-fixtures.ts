/**
 * Synthetic media exports for the gallery and voice-note e2e flows
 * (§19.5 flows 8 and 9). The voice note is a real Ogg Opus stream built
 * here — one second of silent 20 ms CELT frames — so both the engine's own
 * decoder and the ogg-opus-decoder fallback can play it. No committed
 * media (§0 rule 9).
 */
import * as zipJs from '@zip.js/zip.js';

const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

/** A minimal one-page PDF. */
const TINY_PDF =
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 0/Kids[]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n';

const OGG_CRC_POLY = 0x04c11db7;
const OPUS_RATE = 48_000;
const PRE_SKIP = 312;
const FRAME_SAMPLES = 960;
const FRAME_COUNT = 50;
/** TOC 0xF8 (CELT, fullband, 20 ms, mono, one frame) + a silent frame. */
const SILENT_PACKET = [0xf8, 0xff, 0xfe];

const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index << 24;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 0x80000000 ? (value << 1) ^ OGG_CRC_POLY : value << 1;
  }
  return value >>> 0;
});

function oggCrc(bytes: Uint8Array): number {
  let crc = 0;
  for (const byte of bytes) {
    crc = ((crc << 8) ^ (CRC_TABLE[((crc >>> 24) ^ byte) & 0xff] ?? 0)) >>> 0;
  }
  return crc;
}

function oggPage(input: {
  readonly packets: readonly Uint8Array[];
  readonly headerType: number;
  readonly granule: number;
  readonly sequence: number;
}): Uint8Array {
  const lacing = input.packets.flatMap((packet) => {
    const values = new Array<number>(Math.floor(packet.length / 255)).fill(255);
    values.push(packet.length % 255);
    return values;
  });
  const bodyLength = input.packets.reduce((sum, packet) => sum + packet.length, 0);
  const page = new Uint8Array(27 + lacing.length + bodyLength);
  const view = new DataView(page.buffer);
  page.set([0x4f, 0x67, 0x67, 0x53], 0); // "OggS"
  view.setUint8(5, input.headerType);
  view.setBigUint64(6, BigInt(input.granule), true);
  view.setUint32(14, 0x43_4b_31_37, true); // stream serial
  view.setUint32(18, input.sequence, true);
  view.setUint8(26, lacing.length);
  page.set(lacing, 27);
  let offset = 27 + lacing.length;
  for (const packet of input.packets) {
    page.set(packet, offset);
    offset += packet.length;
  }
  view.setUint32(22, oggCrc(page), true);
  return page;
}

function ascii(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

/** One second of silence as an Ogg Opus file. */
export function buildSilentOpus(): Uint8Array {
  const head = new Uint8Array(19);
  const headView = new DataView(head.buffer);
  head.set(ascii('OpusHead'), 0);
  head[8] = 1; // version
  head[9] = 1; // channels
  headView.setUint16(10, PRE_SKIP, true);
  headView.setUint32(12, OPUS_RATE, true);
  const vendor = ascii('fixture');
  const tags = new Uint8Array(8 + 4 + vendor.length + 4);
  const tagsView = new DataView(tags.buffer);
  tags.set(ascii('OpusTags'), 0);
  tagsView.setUint32(8, vendor.length, true);
  tags.set(vendor, 12);
  const frames = Array.from({ length: FRAME_COUNT }, () => new Uint8Array(SILENT_PACKET));
  const pages = [
    oggPage({ packets: [head], headerType: 0x02, granule: 0, sequence: 0 }),
    oggPage({ packets: [tags], headerType: 0, granule: 0, sequence: 1 }),
    oggPage({
      packets: frames,
      headerType: 0x04,
      granule: FRAME_COUNT * FRAME_SAMPLES,
      sequence: 2,
    }),
  ];
  const out = new Uint8Array(pages.reduce((sum, page) => sum + page.length, 0));
  let offset = 0;
  for (const page of pages) {
    out.set(page, offset);
    offset += page.length;
  }
  return out;
}

/** Android 1:1 export with two photos, a voice note, a PDF and a link. */
export const MEDIA_CHAT_TEXT = [
  '17/11/2026, 21:19 - Sara: hello, sending the trip things',
  '17/11/2026, 21:20 - Sara: IMG-20261117-WA0001.jpg (file attached)',
  'the lake',
  '17/11/2026, 21:21 - Ali Khan: IMG-20261117-WA0002.jpg (file attached)',
  '17/11/2026, 21:22 - Sara: PTT-20261117-WA0003.opus (file attached)',
  '17/11/2026, 21:23 - Ali Khan: DOC-20261117-WA0004.pdf (file attached)',
  '18/11/2026, 08:00 - Sara: tickets are at https://tickets.example.com/trip ok',
].join('\n');

/** The zip for {@link MEDIA_CHAT_TEXT}, with every file present. */
export async function buildMediaZip(): Promise<Blob> {
  const png = Buffer.from(TINY_PNG_BASE64, 'base64');
  const writer = new zipJs.ZipWriter(new zipJs.BlobWriter('application/zip'));
  await writer.add('_chat.txt', new zipJs.TextReader(MEDIA_CHAT_TEXT));
  await writer.add('IMG-20261117-WA0001.jpg', new zipJs.Uint8ArrayReader(png));
  await writer.add('IMG-20261117-WA0002.jpg', new zipJs.Uint8ArrayReader(png));
  await writer.add('PTT-20261117-WA0003.opus', new zipJs.Uint8ArrayReader(buildSilentOpus()));
  await writer.add('DOC-20261117-WA0004.pdf', new zipJs.TextReader(TINY_PDF));
  return await writer.close();
}

/** Counts decoded voice notes cached under OPFS `cache/audio/`. */
export async function countCachedWavs(page: {
  readonly evaluate: (fn: () => Promise<number>) => Promise<number>;
}): Promise<number> {
  return page.evaluate(async () => {
    try {
      const root = await navigator.storage.getDirectory();
      const cache = await root.getDirectoryHandle('cache', { create: false });
      const audio = await cache.getDirectoryHandle('audio', { create: false });
      let count = 0;
      for await (const [name, handle] of audio.entries()) {
        if (name.endsWith('.wav') && handle instanceof FileSystemFileHandle) {
          const file = await handle.getFile();
          count += file.size > 44 ? 1 : 0;
        }
      }
      return count;
    } catch {
      return 0;
    }
  });
}
