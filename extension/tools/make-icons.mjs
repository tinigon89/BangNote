import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

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
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size, pixel) {
  const stride = size * 4 + 1;
  const raw = Buffer.alloc(stride * size);
  for (let y = 0; y < size; y++) {
    raw[y * stride] = 0;
    for (let x = 0; x < size; x++) raw.set(pixel((x + 0.5) / size, (y + 0.5) / size), y * stride + 1 + x * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const BLUE = [37, 99, 235, 255];
const WHITE = [255, 255, 255, 255];
const CLEAR = [0, 0, 0, 0];
const R = 0.2;

function insideRoundedSquare(u, v) {
  const dx = Math.max(R - u, 0, u - (1 - R));
  const dy = Math.max(R - v, 0, v - (1 - R));
  return dx * dx + dy * dy <= R * R;
}

const BARS = [
  [0.28, 0.36, 0.72],
  [0.46, 0.54, 0.72],
  [0.64, 0.72, 0.58],
];

function pixel(u, v) {
  if (!insideRoundedSquare(u, v)) return CLEAR;
  for (const [top, bottom, right] of BARS) if (v >= top && v <= bottom && u >= 0.28 && u <= right) return WHITE;
  return BLUE;
}

mkdirSync(new URL('../icons/', import.meta.url), { recursive: true });
for (const size of [16, 32, 48, 128]) {
  writeFileSync(new URL(`../icons/icon${size}.png`, import.meta.url), png(size, pixel));
}
console.log('Đã tạo icons/icon{16,32,48,128}.png');
