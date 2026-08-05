import { realpath, stat } from "node:fs/promises";
import { extname, isAbsolute, relative, resolve, sep } from "node:path";

const IMAGE_TYPES = new Map([
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
]);

export class VisionInputError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "VisionInputError";
    this.code = code;
  }
}

function isWithin(root, candidate) {
  const path = relative(root, candidate);
  return path === "" || (path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path));
}

async function resolveAllowedPath(path) {
  try {
    return await realpath(path);
  } catch {
    return resolve(path);
  }
}

export async function validateImageInput(inputPath, options = {}) {
  if (typeof inputPath !== "string" || inputPath.trim() === "") {
    throw new VisionInputError("INVALID_PATH", "Image path must be a non-empty string.");
  }

  const projectDir = resolve(options.projectDir || process.cwd());
  const candidate = resolve(projectDir, inputPath);
  let imagePath;
  try {
    imagePath = await realpath(candidate);
  } catch {
    throw new VisionInputError("FILE_NOT_FOUND", `Image file not found: ${inputPath}`);
  }

  const allowedPaths = options.allowedPaths?.length ? options.allowedPaths : [projectDir];
  const allowedRoots = await Promise.all(allowedPaths.map((path) => resolveAllowedPath(resolve(projectDir, path))));
  if (!allowedRoots.some((root) => isWithin(root, imagePath))) {
    throw new VisionInputError("PATH_NOT_ALLOWED", `Image path is outside the allowed directories: ${inputPath}`);
  }

  const imageType = IMAGE_TYPES.get(extname(imagePath).toLowerCase());
  if (!imageType) {
    throw new VisionInputError("UNSUPPORTED_TYPE", "Only PNG, JPEG, and WebP images are supported.");
  }

  const fileStats = await stat(imagePath);
  if (!fileStats.isFile()) {
    throw new VisionInputError("NOT_A_FILE", `Image path is not a regular file: ${inputPath}`);
  }

  const maxBytes = Number(options.maxBytes ?? 20 * 1024 * 1024);
  if (fileStats.size > maxBytes) {
    throw new VisionInputError("FILE_TOO_LARGE", `Image is larger than the ${maxBytes} byte limit.`);
  }

  return {
    path: imagePath,
    mediaType: imageType,
    size: fileStats.size,
  };
}
