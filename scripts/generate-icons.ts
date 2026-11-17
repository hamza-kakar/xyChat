/**
 * Generates the app icons (public/icons/*.png, public/apple-touch-icon.png)
 * from a single vector design defined below. Pure Node — PNG encoding is done
 * with zlib plus a hand-rolled chunk writer, so no rasterizer dependency is
 * needed (ADR 0006). The design is original artwork: a rounded-square badge
 * with a chat bubble and three dots.
 *
 * Usage: pnpm icons  (also run automatically as part of `pnpm build`)
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/* ---------- PNG encoding ---------- */

const CRC_TABLE: readonly number[] = (() => {
  const table: number[] = [];
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table.push(c);
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = (CRC_TABLE[crc ^ byte] ?? 0) ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeBytes = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBytes, Buffer.from(data)])));
  return Buffer.concat([length, typeBytes, Buffer.from(data), crc]);
}

/** Encodes an RGBA raster as a PNG buffer (color type 6, no interlace). */
function encodePng(width: number, height: number, rgba: Uint8Array): Buffer {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUint8(8, 8); // bit depth
  ihdr.writeUint8(6, 9); // color type RGBA
  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (width * 4 + 1);
    raw.writeUint8(0, rowStart); // filter: none
    Buffer.from(rgba.buffer, rgba.byteOffset + y * width * 4, width * 4).copy(raw, rowStart + 1);
  }
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', new Uint8Array(0)),
  ]);
}

/* ---------- Vector design (1024-unit space) ---------- */

type Rgb = readonly [number, number, number];
const BADGE_COLOR: Rgb = [14, 124, 102]; // #0E7C66, the accent token
const BUBBLE_COLOR: Rgb = [255, 255, 255];

interface Point {
  readonly x: number;
  readonly y: number;
}

interface Circle {
  readonly center: Point;
  readonly radius: number;
}

interface RoundRect {
  readonly center: Point;
  readonly halfW: number;
  readonly halfH: number;
  readonly radius: number;
}

type Triangle = readonly [Point, Point, Point];

function insideCircle(p: Point, circle: Circle): boolean {
  return Math.hypot(p.x - circle.center.x, p.y - circle.center.y) <= circle.radius;
}

function insideRoundRect(p: Point, rect: RoundRect): boolean {
  const ax = Math.abs(p.x - rect.center.x) - (rect.halfW - rect.radius);
  const ay = Math.abs(p.y - rect.center.y) - (rect.halfH - rect.radius);
  const innerX = Math.max(ax, 0);
  const innerY = Math.max(ay, 0);
  return Math.hypot(innerX, innerY) + Math.min(Math.max(ax, ay), 0) <= rect.radius;
}

function insideTriangle(p: Point, triangle: Triangle): boolean {
  const sign = (q: Point, r: Point, s: Point): number =>
    (q.x - s.x) * (r.y - s.y) - (r.x - s.x) * (q.y - s.y);
  const a = triangle[0];
  const b = triangle[1];
  const c = triangle[2];
  const d1 = sign(p, a, b);
  const d2 = sign(p, b, c);
  const d3 = sign(p, c, a);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}

interface IconDesign {
  /** Content (bubble, tail, dots) scaled into the badge by this factor. */
  readonly contentScale: number;
  /** Badge corner radius in design units; 0 = full-bleed square. */
  readonly badgeRadius: number;
}

/** Topmost opaque color at a design-space point, or null when transparent. */
function colorAt(p: Point, design: IconDesign): Rgb | null {
  const s = design.contentScale;
  const c: Point = { x: (p.x - 512) / s + 512, y: (p.y - 512) / s + 512 };
  const dotsY = 470;
  const bubbles: readonly Circle[] = [
    { center: { x: 392, y: dotsY }, radius: 38 },
    { center: { x: 512, y: dotsY }, radius: 38 },
    { center: { x: 632, y: dotsY }, radius: 38 },
  ];
  if (bubbles.some((dot) => insideCircle(c, dot))) {
    return BADGE_COLOR;
  }
  const tail: Triangle = [
    { x: 350, y: 690 },
    { x: 350, y: 850 },
    { x: 520, y: 710 },
  ];
  if (insideTriangle(c, tail)) {
    return BUBBLE_COLOR;
  }
  if (insideRoundRect(c, { center: { x: 512, y: 470 }, halfW: 330, halfH: 250, radius: 130 })) {
    return BUBBLE_COLOR;
  }
  if (
    design.badgeRadius === 0 ||
    insideRoundRect(p, {
      center: { x: 512, y: 512 },
      halfW: 512,
      halfH: 512,
      radius: design.badgeRadius,
    })
  ) {
    return BADGE_COLOR;
  }
  return null;
}

interface SampledPixel {
  readonly color: Rgb;
  /** Fraction of the 9 sub-samples covered by this color (0–1). */
  readonly coverage: number;
}

/** 3×3 supersampled color vote for one pixel; null when fully transparent. */
function samplePixel(
  px: number,
  py: number,
  step: number,
  design: IconDesign,
): SampledPixel | null {
  const subOffsets = [-step / 3, 0, step / 3];
  const counts = new Map<Rgb, number>();
  for (const dy of subOffsets) {
    for (const dx of subOffsets) {
      const color = colorAt({ x: (px + 0.5) * step + dx, y: (py + 0.5) * step + dy }, design);
      if (color !== null) {
        counts.set(color, (counts.get(color) ?? 0) + 1);
      }
    }
  }
  let dominant: Rgb | null = null;
  let dominantCount = -1;
  for (const [color, count] of counts) {
    if (count > dominantCount) {
      dominant = color;
      dominantCount = count;
    }
  }
  if (dominant === null || dominantCount <= 0) {
    return null;
  }
  return { color: dominant, coverage: dominantCount / 9 };
}

/** Renders the design at `size` px with 3×3 supersampling. */
function render(size: number, design: IconDesign): Buffer {
  const rgba = new Uint8Array(size * size * 4);
  const step = 1024 / size;
  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      const offset = (py * size + px) * 4;
      const pixel = samplePixel(px, py, step, design);
      if (pixel === null) {
        rgba.fill(0, offset, offset + 4);
      } else {
        rgba[offset] = pixel.color[0];
        rgba[offset + 1] = pixel.color[1];
        rgba[offset + 2] = pixel.color[2];
        rgba[offset + 3] = Math.round(pixel.coverage * 255);
      }
    }
  }
  return encodePng(size, size, rgba);
}

/* ---------- Output ---------- */

const ROUNDED: IconDesign = { contentScale: 1, badgeRadius: 224 };
const FULL_BLEED: IconDesign = { contentScale: 0.62, badgeRadius: 0 };

const outputs: readonly {
  readonly path: string;
  readonly size: number;
  readonly design: IconDesign;
}[] = [
  { path: 'public/icons/icon-192.png', size: 192, design: ROUNDED },
  { path: 'public/icons/icon-512.png', size: 512, design: ROUNDED },
  { path: 'public/icons/icon-maskable-512.png', size: 512, design: FULL_BLEED },
  { path: 'public/apple-touch-icon.png', size: 180, design: FULL_BLEED },
];

for (const output of outputs) {
  const absolute = resolve(projectRoot, output.path);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, render(output.size, output.design));
  console.log(`wrote ${output.path} (${output.size}x${output.size})`);
}
