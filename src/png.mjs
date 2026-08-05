import { deflateSync } from "node:zlib";

const TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function tableCrc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// zlib.crc32 requires Node >=20.15; engines say >=20, so prefer it and fall back.
const zlib = await import("node:zlib");
export const crc32 = typeof zlib.crc32 === "function" ? zlib.crc32 : tableCrc32;

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, "ascii"), data])) >>> 0);
  return Buffer.concat([length, Buffer.from(type, "ascii"), data, crc]);
}

/**
 * Build a minimal truecolor (RGB, 8-bit) PNG in memory. `pixel(x, y)` returns
 * { r, g, b } for each coordinate. No dependencies; used by the --smoke check.
 */
export function createPng({ width, height, pixel }) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: truecolor RGB

  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (width * 3 + 1);
    raw[rowStart] = 0; // filter: none
    for (let x = 0; x < width; x += 1) {
      const color = pixel(x, y);
      const offset = rowStart + 1 + x * 3;
      raw[offset] = color.r;
      raw[offset + 1] = color.g;
      raw[offset + 2] = color.b;
    }
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
