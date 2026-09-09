/**
 * Generates the PWA icons referenced by public/manifest.json.
 *
 * Written as a tiny PNG encoder rather than pulling in an image library: the
 * icons are a flat gradient plus one polygon, and the deploy already suffers
 * when native dependencies enter the tree.
 *
 * Run with: node scripts/make-icons.mjs
 */
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const outDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  let o = 0;
  for (let y = 0; y < height; y++) {
    raw[o++] = 0; // filter: none
    rgba.copy(raw, o, y * width * 4, (y + 1) * width * 4);
    o += width * 4;
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Lightning bolt in a 0..1 box, matching the mark used across the UI. */
const BOLT = [
  [0.56, 0.10],
  [0.30, 0.545],
  [0.465, 0.545],
  [0.42, 0.90],
  [0.70, 0.435],
  [0.525, 0.435],
];

function inPolygon(px, py, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function makeIcon(size) {
  const buf = Buffer.alloc(size * size * 4);
  const ss = 2; // supersampling factor for smooth edges

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Brand gradient, top-left #38BDF8 to bottom-right #0284C7.
      const t = (x / size + y / size) / 2;
      const r = Math.round(56 + (2 - 56) * t);
      const g = Math.round(189 + (132 - 189) * t);
      const b = Math.round(248 + (199 - 248) * t);

      let hits = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const u = (x + (sx + 0.5) / ss) / size;
          const v = (y + (sy + 0.5) / ss) / size;
          if (inPolygon(u, v, BOLT)) hits++;
        }
      }
      const cover = hits / (ss * ss);

      const i = (y * size + x) * 4;
      buf[i] = Math.round(r + (255 - r) * cover);
      buf[i + 1] = Math.round(g + (255 - g) * cover);
      buf[i + 2] = Math.round(b + (255 - b) * cover);
      buf[i + 3] = 255;
    }
  }
  return encodePng(size, size, buf);
}

fs.mkdirSync(outDir, { recursive: true });
for (const size of [192, 512]) {
  const file = path.join(outDir, `icon-${size}.png`);
  fs.writeFileSync(file, makeIcon(size));
  console.log('wrote', file, fs.statSync(file).size, 'bytes');
}
