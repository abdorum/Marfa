// Renders public/icons/icon.svg's shapes to PNG (iOS needs PNG home-screen icons).
// Usage: npm run icons
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
// [x, y, w, h, radius, color] on a 512 grid, painted in order.
const SHAPES = [
  [0, 0, 512, 512, 112, '#262626'],
  [112, 132, 288, 256, 40, '#ffffff'],
  [112, 132, 288, 72, 40, '#dbe9f7'],
  [112, 172, 288, 32, 0, '#dbe9f7'],
  [176, 100, 28, 68, 14, '#ffffff'],
  [308, 100, 28, 68, 14, '#ffffff'],
  [160, 244, 64, 44, 12, '#0b6ec4'],
  [244, 244, 64, 44, 12, '#9cc4ec'],
  [160, 308, 64, 44, 12, '#9cc4ec'],
  [244, 308, 64, 44, 12, '#9cc4ec'],
];

function coverage(px, py, [x, y, w, h, r]) {
  // 4x4 supersampling of a rounded rectangle.
  let hit = 0;
  for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) {
    const X = px + (sx + 0.5) / 4, Y = py + (sy + 0.5) / 4;
    if (X < x || X > x + w || Y < y || Y > y + h) continue;
    const cx = Math.min(Math.max(X, x + r), x + w - r), cy = Math.min(Math.max(Y, y + r), y + h - r);
    if ((X - cx) ** 2 + (Y - cy) ** 2 <= r * r) hit++;
  }
  return hit / 16;
}

function render(size, fullBleed) {
  const s = size / 512;
  const buf = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let rgba = [0, 0, 0, 0];
    SHAPES.forEach((shape, i) => {
      const [sx, sy, w, h, r, color] = shape;
      const scaled = [sx * s, sy * s, w * s, h * s, (i === 0 && fullBleed ? 0 : r) * s];
      const a = coverage(x, y, scaled);
      if (!a) return;
      const c = hex(color);
      const outA = a + rgba[3] * (1 - a);
      rgba = [0, 1, 2].map(k => (c[k] * a + rgba[k] * rgba[3] * (1 - a)) / (outA || 1)).concat(outA);
    });
    const o = (y * size + x) * 4;
    buf[o] = rgba[0]; buf[o + 1] = rgba[1]; buf[o + 2] = rgba[2]; buf[o + 3] = Math.round(rgba[3] * 255);
  }
  return png(size, buf);
}

function png(size, rgba) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  const crcTable = [...Array(256)].map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = b => { let c = ~0; for (const x of b) c = crcTable[(c ^ x) & 255] ^ (c >>> 8); return (~c) >>> 0; };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const out = path.join(__dirname, '..', 'public', 'icons');
// iOS rounds the corners itself, so its icon is full-bleed.
fs.writeFileSync(path.join(out, 'icon-180.png'), render(180, true));
fs.writeFileSync(path.join(out, 'icon-192.png'), render(192, false));
fs.writeFileSync(path.join(out, 'icon-512.png'), render(512, true));
console.log('icons written to', out);
