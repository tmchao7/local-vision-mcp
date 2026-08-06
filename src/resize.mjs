import { inflateSync } from "node:zlib";
import { createPng } from "./png.mjs";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function pngDimensions(buffer) {
  if (buffer.length < 24 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function collectChunks(buffer) {
  const found = [];
  let offset = 8;
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR" || type === "IDAT") found.push({ type, data });
    offset += 12 + length;
  }
  return found;
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

function unfilter(raw, width, height, channels) {
  const stride = width * channels;
  // Output is pixel-only (no filter bytes): height * stride bytes.
  const out = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (stride + 1);
    const filter = raw[rowStart];
    const outRow = y * stride;
    for (let i = 0; i < stride; i += 1) {
      const left = i >= channels ? out[outRow + i - channels] : 0;
      const up = y > 0 ? out[outRow - stride + i] : 0;
      const upLeft = y > 0 && i >= channels ? out[outRow - stride + i - channels] : 0;
      const base = raw[rowStart + 1 + i];
      let value;
      switch (filter) {
        case 0: value = base; break;
        case 1: value = base + left; break;
        case 2: value = base + up; break;
        case 3: value = base + Math.floor((left + up) / 2); break;
        case 4: value = base + paeth(left, up, upLeft); break;
        default: return null;
      }
      out[outRow + i] = value & 0xff;
    }
  }
  return out;
}

/**
 * Decode a PNG to { width, height, channels, pixels }. Only 8-bit truecolor
 * (RGB) and truecolor-with-alpha (RGBA) are supported; anything else (palette,
 * grayscale, 16-bit) returns null so callers can pass the original through.
 */
export function decodePng(buffer) {
  const dims = pngDimensions(buffer);
  if (!dims) return null;
  // IHDR data starts at 16: 8 signature + 4 length + 4 type.
  const ihdr = buffer.subarray(16, 29);
  const bitDepth = ihdr[8];
  const colorType = ihdr[9];
  const channels = colorType === 2 ? 3 : colorType === 6 ? 4 : 0;
  if (bitDepth !== 8 || channels === 0) return null;

  const idat = collectChunks(buffer).filter(({ type }) => type === "IDAT").map(({ data }) => data);
  if (idat.length === 0) return null;
  const raw = inflateSync(Buffer.concat(idat));
  const pixels = unfilter(raw, dims.width, dims.height, channels);
  if (!pixels) return null;
  return { ...dims, channels, pixels };
}

function sample(decoded, x, y) {
  const { width, height, channels, pixels } = decoded;
  const x0 = Math.min(Math.floor(x), width - 1);
  const y0 = Math.min(Math.floor(y), height - 1);
  const x1 = Math.min(x0 + 1, width - 1);
  const y1 = Math.min(y0 + 1, height - 1);
  const fx = x - x0;
  const fy = y - y0;
  const at = (px, py) => {
    const offset = (py * width + px) * channels;
    if (channels === 4 && pixels[offset + 3] === 0) return [255, 255, 255];
    return [pixels[offset], pixels[offset + 1], pixels[offset + 2]];
  };
  const [a, b, c, d] = [at(x0, y0), at(x1, y0), at(x0, y1), at(x1, y1)];
  const blend = (p, q, s, t, u) => Math.round((p * (1 - fx) + q * fx) * (1 - fy) + (s * (1 - fx) + t * fx) * fy);
  return { r: blend(a[0], b[0], c[0], d[0]), g: blend(a[1], b[1], c[1], d[1]), b: blend(a[2], b[2], c[2], d[2]) };
}

/**
 * Downscale a PNG so its longest edge is at most maxEdge (bilinear sampling).
 * Returns null when the image is already small enough or unsupported, so
 * callers can keep the original bytes.
 */
export function resizePng(buffer, maxEdge) {
  const decoded = decodePng(buffer);
  if (!decoded) return null;
  const { width, height } = decoded;
  if (width <= maxEdge && height <= maxEdge) return null;

  const scale = Math.min(maxEdge / width, maxEdge / height);
  const targetWidth = Math.max(1, Math.round(width * scale));
  const targetHeight = Math.max(1, Math.round(height * scale));

  return createPng({
    width: targetWidth,
    height: targetHeight,
    pixel: (x, y) => sample(decoded, (x + 0.5) / targetWidth * width, (y + 0.5) / targetHeight * height),
  });
}
