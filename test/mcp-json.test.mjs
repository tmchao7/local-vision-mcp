import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  DEFAULT_KEEP_ALIVE,
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_EDGE,
  DEFAULT_MAX_OUTPUT_CHARS,
  DEFAULT_MODEL,
  DEFAULT_OLLAMA_HOST,
  DEFAULT_TIMEOUT_MS,
} from "../src/config.mjs";

const expectedDefaults = {
  VISION_MODEL: DEFAULT_MODEL,
  VISION_OLLAMA_HOST: DEFAULT_OLLAMA_HOST,
  VISION_MAX_BYTES: String(DEFAULT_MAX_BYTES),
  VISION_TIMEOUT_MS: String(DEFAULT_TIMEOUT_MS),
  VISION_KEEP_ALIVE: DEFAULT_KEEP_ALIVE,
  VISION_MAX_OUTPUT_CHARS: String(DEFAULT_MAX_OUTPUT_CHARS),
  VISION_MAX_EDGE: String(DEFAULT_MAX_EDGE),
  VISION_ALLOWED_PATHS: "",
};

test(".mcp.json forwards every VISION_* env var with defaults matching config.mjs", async () => {
  const mcpJson = JSON.parse(await readFile(new URL("../.mcp.json", import.meta.url), "utf8"));
  const env = mcpJson.mcpServers["local-vision"].env;

  assert.deepEqual(
    Object.keys(env).sort(),
    Object.keys(expectedDefaults).sort(),
    "env keys must stay in sync with src/config.mjs; add new VISION_* vars here",
  );

  for (const [name, defaultValue] of Object.entries(expectedDefaults)) {
    const value = env[name];
    const match = value.match(/^\$\{([A-Z_]+):-(.*)\}$/);
    assert.ok(match, `${name} must use ${"${VAR:-default}"} expansion syntax`);
    assert.equal(match[1], name, `${name} expansion must reference the same env var`);
    assert.equal(match[2], defaultValue, `${name} default must match src/config.mjs`);
  }
});
