// Renders public/icons/icon.svg's shapes to PNG (iOS needs PNG home-screen icons).
// Usage: npm run icons
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
// [x, y, w, h, [top-left, top-right, bottom-right, bottom-left radius], color] on a 512 grid, painted in order.
// The gate (بوابة) with a card in its doorway: the product's mark.
const SHAPES = [
  [0, 0, 512, 512, [112, 112, 112, 112], ['#6266D8', '#3C40A6']],
  [128, 96, 256, 320, [128, 128, 28, 28], '#FFFFFF'],
  [172, 150, 168, 266, [84, 84, 0, 0], '#12143B'],
  [206, 318, 100, 64, [14, 14, 14, 14], '#D7F25E'],
  [244, 220, 24, 24, [12, 12, 12, 12], '#3D63FF'],
];

function inside(X, Y, x, y, w, h, [tl, tr, br, bl]) {
  if (X < x || X > x + w || Y < y || Y > y + h) return false;
  const corner = (cx, cy, r) => (X - cx) ** 2 + (Y - cy) ** 2 <= r * r;
  if (X < x + tl && Y < y + tl) return corner(x + tl, y + tl, tl);
  if (X > x + w - tr && Y < y + tr) return corner(x + w - tr, y + tr, tr);
  if (X > x + w - br && Y > y + h - br) return corner(x + w - br, y + h - br, br);
  if (X < x + bl && Y > y + h - bl) return corner(x + bl, y + h - bl, bl);
  return true;
}

function render(size, fullBleed) {
  const s = size / 512;
  const buf = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) {
    let rgba = [0, 0, 0, 0];
    SHAPES.forEach((shape, i) => {
      const [sx, sy, w, h, radii, color] = shape;
      const r = radii.map(v => (i === 0 && fullBleed ? 0 : v) * s);
      // 4x4 supersampling.
      let hit = 0;
      for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) {
        if (inside(px + (b + 0.5) / 4, py + (a + 0.5) / 4, sx * s, sy * s, w * s, h * s, r)) hit++;
      }
      const cov = hit / 16;
      if (!cov) return;
      // The background is a vertical gradient.
      const c = Array.isArray(color)
        ? hex(color[0]).map((v, k) => v + (hex(color[1])[k] - v) * (py / size))
        : hex(color);
      const outA = cov + rgba[3] * (1 - cov);
      rgba = [0, 1, 2].map(k => (c[k] * cov + rgba[k] * rgba[3] * (1 - cov)) / (outA || 1)).concat(outA);
    });
    const o = (py * size + px) * 4;
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
// iOS rounds the corners itself, so its icon is full-bleed; so is the maskable one.
fs.writeFileSync(path.join(out, 'icon-180.png'), render(180, true));
fs.writeFileSync(path.join(out, 'icon-192.png'), render(192, false));
fs.writeFileSync(path.join(out, 'icon-512.png'), render(512, true));
console.log('icons written to', out);
