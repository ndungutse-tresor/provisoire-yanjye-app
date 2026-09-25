'use strict';
// Draws the app icon (same design as public/icons/icon.svg) into PNGs. No image libraries needed.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const BLUE = [11, 61, 145], YELLOW = [255, 196, 0], INK = [15, 27, 45];

// Colour at a point of the 512x512 design, or null for transparent.
function shade(x, y, maskable) {
  if (maskable) {
    // Full-bleed background; artwork shrunk into the 80% safe zone.
    x = 256 + (x - 256) / 0.8;
    y = 256 + (y - 256) / 0.8;
  } else {
    const r = 112;
    const cx = Math.min(Math.max(x, r), 512 - r), cy = Math.min(Math.max(y, r), 512 - r);
    if ((x - cx) ** 2 + (y - cy) ** 2 > r * r) return null;
  }
  const d = Math.abs(x - 256) + Math.abs(y - 256);
  if (d > 186) return BLUE;
  if (Math.abs(d - 146) <= 11.3) return INK;
  // road: triangle (226,350) (256,170) (286,350)
  if (y >= 170 && y <= 350) {
    const half = (y - 170) / 180 * 30;
    if (Math.abs(x - 256) <= half) {
      const dash = [[196, 222], [246, 272], [296, 322]].some(([a, b]) => y >= a - 4 && y <= b + 4);
      if (dash && Math.abs(x - 256) <= 4) return YELLOW;
      return INK;
    }
  }
  return YELLOW;
}

function render(size, maskable) {
  const S = 4, px = Buffer.alloc(size * size * 4);
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) {
          const c = shade((i + (sx + 0.5) / S) * 512 / size, (j + (sy + 0.5) / S) * 512 / size, maskable);
          if (c) { r += c[0]; g += c[1]; b += c[2]; a++; }
        }
      }
      const o = (j * size + i) * 4;
      if (a) { px[o] = r / a; px[o + 1] = g / a; px[o + 2] = b / a; }
      px[o + 3] = Math.round(a / (S * S) * 255);
    }
  }
  return png(size, px);
}

const CRC = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function crc32(buf) {
  let c = -1;
  for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, rgba) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

const out = path.join(__dirname, '..', 'public', 'icons');
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'icon-192.png'), render(192, false));
fs.writeFileSync(path.join(out, 'icon-512.png'), render(512, false));
fs.writeFileSync(path.join(out, 'icon-maskable-512.png'), render(512, true));
console.log('Icons written to public/icons');
