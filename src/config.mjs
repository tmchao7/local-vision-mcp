import { homedir } from "node:os";
import { delimiter, resolve } from "node:path";

export const DEFAULT_OLLAMA_HOST = "http://127.0.0.1:11434";
export const DEFAULT_MODEL = "qwen3-vl:4b";
export const DEFAULT_MAX_BYTES = 20 * 1024 * 1024;
export const DEFAULT_TIMEOUT_MS = 120_000;
export const DEFAULT_KEEP_ALIVE = "24h";
export const DEFAULT_MAX_OUTPUT_CHARS = 12_000;
export const DEFAULT_MAX_EDGE = 1280;
export const DEFAULT_USER_IMAGE_DIRECTORIES = ["Pictures", "Desktop", "Downloads"];

function positiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function splitPaths(value) {
  return String(value ?? "")
    .split(delimiter)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function readConfig(env = process.env, cwd = process.cwd()) {
  const projectDir = resolve(env.CLAUDE_PROJECT_DIR || cwd);
  const defaultImagePaths = DEFAULT_USER_IMAGE_DIRECTORIES.map((directory) => resolve(homedir(), directory));
  const allowedPaths = [
    projectDir,
    ...defaultImagePaths,
    ...splitPaths(env.VISION_ALLOWED_PATHS).map((item) => resolve(projectDir, item)),
  ];

  return {
    projectDir,
    allowedPaths: [...new Set(allowedPaths)],
    ollamaHost: String(env.VISION_OLLAMA_HOST || env.OLLAMA_HOST || DEFAULT_OLLAMA_HOST).replace(/\/$/, ""),
    model: String(env.VISION_MODEL || DEFAULT_MODEL),
    maxBytes: positiveNumber(env.VISION_MAX_BYTES, DEFAULT_MAX_BYTES),
    timeoutMs: positiveNumber(env.VISION_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
    keepAlive: String(env.VISION_KEEP_ALIVE || DEFAULT_KEEP_ALIVE),
    maxOutputChars: positiveNumber(env.VISION_MAX_OUTPUT_CHARS, DEFAULT_MAX_OUTPUT_CHARS),
    maxEdge: positiveNumber(env.VISION_MAX_EDGE, DEFAULT_MAX_EDGE),
  };
}
