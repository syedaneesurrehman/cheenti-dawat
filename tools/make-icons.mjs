// Generates the PWA icons (pixel-art ant on a mango) as PNGs with no dependencies.
// Usage: node tools/make-icons.mjs
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const out = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'icons');
fs.mkdirSync(out, { recursive: true });

// 20x20 art. . = background, others from the legend.
const ART = [
  '....................',
  '.........gg.........',
  '........gGGg..b.....',
  '.......gGGGgb.......',
  '.......gGGg.b.......',
  '.....YYYYYYbYYY.....',
  '...YYYYYYYYYYYYYY...',
  '..YYYYYYYYYYYOOOYY..',
  '..YYYYa.aYYYYOOOOY..',
  '.YYYYYYaYYYYYYOOOYY.',
  '.YYYa.aAaYa.aYYYOYY.',
  '.YYYYaAAAaYYYYYYYYY.',
  '.YYYa.aAa.aYYYYYYYY.',
  '.YYYYYAAAYYYYYYYYYY.',
  '..YYYaAAAaYYYYYYYY..',
  '..YYYYaAaYYYYYYYYY..',
  '...YYYYYYYYYYYYYY...',
  '.....YYYYYYYYYY.....',
  '.......YYYYYY.......',
  '....................',
];
const LEGEND = {
  Y: [255, 194, 26], O: [255, 122, 26], g: [46, 140, 60], G: [76, 176, 74], b: [122, 74, 34],
  a: [40, 22, 12], A: [64, 34, 18],
};
const BG = [36, 22, 14];
const RING = [18, 161, 80];

function crcTable() {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
}
const TABLE = crcTable();
function crc32(buf) { let c = 0xffffffff; for (const b of buf) c = TABLE[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, px) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = px(x, y);
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}

// margin: fraction of the icon kept clear around the art (maskable icons need ~20%).
function icon(size, margin, rounded) {
  const artSize = size * (1 - margin * 2);
  const cell = artSize / ART.length;
  const off = size * margin;
  const r = size * 0.22;
  return png(size, (x, y) => {
    if (rounded) {
      const cx = Math.min(Math.max(x, r), size - r), cy = Math.min(Math.max(y, r), size - r);
      if (Math.hypot(x - cx, y - cy) > r) return [0, 0, 0, 0];
    }
    const d = Math.hypot(x - size / 2, y - size / 2) / (size / 2);
    const ax = Math.floor((x - off) / cell), ay = Math.floor((y - off) / cell);
    const ch = ART[ay]?.[ax];
    if (ch && ch !== '.') return [...LEGEND[ch], 255];
    if (d > 0.9 && d < 0.96 && !rounded) return [...RING, 255];
    return [...BG, 255];
  });
}

fs.writeFileSync(path.join(out, 'icon-192.png'), icon(192, 0.1, true));
fs.writeFileSync(path.join(out, 'icon-512.png'), icon(512, 0.1, true));
fs.writeFileSync(path.join(out, 'maskable-512.png'), icon(512, 0.2, false));
fs.writeFileSync(path.join(out, 'apple-touch-icon.png'), icon(180, 0.1, false));
console.log('icons written to', out);
