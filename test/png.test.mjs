import assert from "node:assert/strict";
import { inflateSync } from "node:zlib";
import { test } from "node:test";
import { crc32, createPng } from "../src/png.mjs";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function findChunk(png, type) {
  let offset = 8;
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const chunkType = png.toString("ascii", offset + 4, offset + 8);
    if (chunkType === type) {
      return {
        data: png.subarray(offset + 8, offset + 8 + length),
        crcOffset: offset + 8 + length,
      };
    }
    offset += 12 + length;
  }
  return null;
}

test("crc32 implements the standard check value", () => {
  assert.equal(crc32(Buffer.from("123456789", "ascii")), 0xcbf43926);
});

test("createPng emits a structurally valid truecolor PNG", () => {
  const png = createPng({ width: 8, height: 4, pixel: () => ({ r: 1, g: 2, b: 3 }) });

  assert.deepEqual(png.subarray(0, 8), PNG_SIGNATURE);

  const ihdr = findChunk(png, "IHDR");
  assert.ok(ihdr);
  assert.equal(ihdr.data.length, 13);
  assert.equal(ihdr.data.readUInt32BE(0), 8, "width");
  assert.equal(ihdr.data.readUInt32BE(4), 4, "height");
  assert.equal(ihdr.data[8], 8, "bit depth");
  assert.equal(ihdr.data[9], 2, "color type truecolor");

  const idat = findChunk(png, "IDAT");
  assert.ok(idat);
  const raw = inflateSync(idat.data);
  assert.equal(raw.length, (8 * 3 + 1) * 4, "one filter byte per row plus RGB pixels");
  assert.equal(raw[0], 0, "first row uses the none filter");
  assert.deepEqual(Array.from(raw.subarray(1, 4)), [1, 2, 3], "first pixel color");

  assert.ok(findChunk(png, "IEND"));
});

test("every chunk stores a correct CRC over type and data", () => {
  const png = createPng({ width: 4, height: 4, pixel: () => ({ r: 0, g: 0, b: 0 }) });

  let offset = 8;
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const typeAndData = png.subarray(offset + 4, offset + 8 + length);
    const stored = png.readUInt32BE(offset + 8 + length);
    assert.equal(crc32(typeAndData), stored, `chunk ${png.toString("ascii", offset + 4, offset + 8)}`);
    offset += 12 + length;
  }
});

test("pixel coordinates reach the expected raster positions", () => {
  const seen = [];
  const png = createPng({
    width: 3,
    height: 2,
    pixel: (x, y) => {
      seen.push([x, y]);
      return { r: x * 100, g: y * 100, b: 0 };
    },
  });

  assert.deepEqual(seen, [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1]]);

  const idat = findChunk(png, "IDAT");
  const raw = inflateSync(idat.data);
  // Row 1 (y=0) pixels at offsets 1..9; row 2 (y=1) is filter byte at 10 + pixels at 11..19.
  assert.deepEqual(Array.from(raw.subarray(1, 10)), [0, 0, 0, 100, 0, 0, 200, 0, 0]);
  assert.deepEqual(Array.from(raw.subarray(10, 20)), [0, 0, 100, 0, 100, 100, 0, 200, 100, 0]);
});
