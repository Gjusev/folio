// Rasterises the Folio mark into PNGs without dependencies.
// Same shapes as public/icon.svg: stone rounded square, white sheet, accent dot.
// Run after changing the mark: node scripts/make-icons.mjs
import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const STONE = [0xf6, 0xf5, 0xf1];
const SHEET = [0xff, 0xff, 0xff];
const EDGE = [0xe6, 0xe5, 0xdf];
const ACCENT = [0x1b, 0x6c, 0x80];

// Signed distance to a rounded rectangle (negative inside).
function sdRoundRect(x, y, cx, cy, hw, hh, r) {
  const dx = Math.abs(x - cx) - (hw - r);
  const dy = Math.abs(y - cy) - (hh - r);
  const ax = Math.max(dx, 0);
  const ay = Math.max(dy, 0);
  return Math.hypot(ax, ay) + Math.min(Math.max(dx, dy), 0) - r;
}

function coverage(sd) {
  // 1px feather for anti-aliasing.
  return Math.max(0, Math.min(1, 0.5 - sd));
}

function render(size) {
  const s = size / 512; // design space is 512
  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 4); // filter byte 0 + RGBA
    for (let x = 0; x < size; x++) {
      const px = (x + 0.5) / s;
      const py = (y + 0.5) / s;
      let color = [0, 0, 0];
      let alpha = 0;
      const bg = coverage(sdRoundRect(px, py, 256, 256, 256, 256, 112));
      if (bg > 0) {
        color = STONE;
        alpha = bg;
      }
      // Sheet fill, then its 4px edge, then the dot.
      const sheet = coverage(sdRoundRect(px, py, 256, 256, 184, 184, 40));
      if (sheet > 0) {
        const edgeBand =
          coverage(sdRoundRect(px, py, 256, 256, 184, 184, 40)) -
          coverage(sdRoundRect(px, py, 256, 256, 180, 180, 38));
        const c = edgeBand > 0.5 ? EDGE : SHEET;
        const a = Math.max(sheet, edgeBand);
        color = color.map((v, i) => v + (c[i] - v) * a);
        alpha = alpha + (1 - alpha) * sheet;
      }
      const dot = coverage(Math.hypot(px - 256, py - 340) - 44);
      if (dot > 0) {
        color = color.map((v, i) => v + (ACCENT[i] - v) * dot);
        alpha = alpha + (1 - alpha) * dot;
      }
      const o = 1 + x * 4;
      row[o] = Math.round(color[0]);
      row[o + 1] = Math.round(color[1]);
      row[o + 2] = Math.round(color[2]);
      row[o + 3] = Math.round(alpha * 255);
    }
    rows.push(row);
  }
  return encodePng(size, Buffer.concat(rows));
}

// --- minimal PNG encoder (RGBA, filter 0) ---
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function encodePng(size, raw) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

for (const size of [192, 512]) {
  writeFileSync(`public/icon-${size}.png`, render(size));
  console.log(`public/icon-${size}.png`);
}
