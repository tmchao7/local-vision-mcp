import assert from "node:assert/strict";
import { deflateSync } from "node:zlib";
import { test } from "node:test";
import { createPng, crc32 } from "../src/png.mjs";
import { decodePng, pngDimensions, resizePng } from "../src/resize.mjs";

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, "ascii"), data])) >>> 0);
  return Buffer.concat([length, Buffer.from(type, "ascii"), data, crc]);
}

function pngFromRaw(raw, width, height) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

test("pngDimensions reads width and height from IHDR", () => {
  const png = createPng({ width: 96, height: 64, pixel: () => ({ r: 0, g: 0, b: 0 }) });
  assert.deepEqual(pngDimensions(png), { width: 96, height: 64 });
  assert.equal(pngDimensions(Buffer.from("not a png")), null);
});

test("decodePng round-trips an unfiltered image", () => {
  const png = createPng({
    width: 4,
    height: 3,
    pixel: (x, y) => ({ r: x * 60, g: y * 80, b: 30 }),
  });
  const decoded = decodePng(png);

  assert.equal(decoded.channels, 3);
  assert.equal(decoded.pixels[0], 0);
  // pixel (2, 1): r = 120, g = 80
  const offset = (1 * 4 + 2) * 3;
  assert.equal(decoded.pixels[offset], 120);
  assert.equal(decoded.pixels[offset + 1], 80);
});

test("decodePng inverts all four PNG filter types", () => {
  const width = 4;
  const height = 4;
  const channels = 3;
  const pixelAt = (x, y) => [x * 50, y * 60, (x + y) * 20];

  // Build rows with filter types 1 (Sub), 2 (Up), 3 (Average), 4 (Paeth).
  const raw = Buffer.alloc((width * channels + 1) * height);
  const paeth = (a, b, c) => {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  for (let y = 0; y < height; y += 1) {
    const row = y * (width * channels + 1);
    raw[row] = y + 1; // filters 1..4
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = pixelAt(x, y);
      const values = [r, g, b];
      for (let c = 0; c < channels; c += 1) {
        const offset = row + 1 + x * channels + c;
        const target = values[c];
        const left = x > 0 ? pixelAt(x - 1, y)[c] : 0;
        const up = y > 0 ? pixelAt(x, y - 1)[c] : 0;
        const upLeft = x > 0 && y > 0 ? pixelAt(x - 1, y - 1)[c] : 0;
        let filtered = target;
        if (y === 0) filtered = (target - left) & 0xff; // Sub
        else if (y === 1) filtered = (target - up) & 0xff; // Up
        else if (y === 2) filtered = (target - Math.floor((left + up) / 2)) & 0xff; // Average
        else filtered = (target - paeth(left, up, upLeft)) & 0xff; // Paeth
        raw[offset] = filtered;
      }
    }
  }

  const decoded = decodePng(pngFromRaw(raw, width, height));
  assert.ok(decoded, "filtered PNG must decode");
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * channels;
      assert.deepEqual(
        Array.from(decoded.pixels.subarray(offset, offset + 3)),
        pixelAt(x, y),
        `pixel (${x}, ${y})`,
      );
    }
  }
});

test("resizePng downscales to the configured longest edge", () => {
  const png = createPng({
    width: 96,
    height: 96,
    pixel: (x, y) => (x >= 32 && x < 64 && y >= 32 && y < 64) ? { r: 255, g: 165, b: 0 } : { r: 255, g: 255, b: 255 },
  });
  const resized = resizePng(png, 48);

  assert.ok(resized, "oversized image must be resized");
  assert.deepEqual(pngDimensions(resized), { width: 48, height: 48 });

  // Center of the resized image is still the orange square.
  const decoded = decodePng(resized);
  const center = (23 * 48 + 23) * 3;
  assert.deepEqual(Array.from(decoded.pixels.subarray(center, center + 3)), [255, 165, 0]);
  assert.deepEqual(Array.from(decoded.pixels.subarray(0, 3)), [255, 255, 255], "corner stays white");
});

test("resizePng returns null when the image already fits", () => {
  const png = createPng({ width: 64, height: 48, pixel: () => ({ r: 1, g: 2, b: 3 }) });
  assert.equal(resizePng(png, 1280), null);
});

test("resizePng handles non-square aspect ratios", () => {
  const png = createPng({ width: 400, height: 100, pixel: () => ({ r: 10, g: 20, b: 30 }) });
  const resized = resizePng(png, 100);

  assert.deepEqual(pngDimensions(resized), { width: 100, height: 25 });
});
