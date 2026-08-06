import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildMcpServerConfig,
  configEnv,
  formatMcpServerConfig,
  mcpConfigFormat,
} from "../src/mcp-config.mjs";

const config = {
  model: "qwen3-vl:4b",
  ollamaHost: "http://127.0.0.1:11434",
  maxBytes: 20 * 1024 * 1024,
  timeoutMs: 120_000,
  keepAlive: "24h",
  maxOutputChars: 12_000,
  maxEdge: 1280,
};

test("configEnv carries every resolved setting with string values", () => {
  assert.deepEqual(configEnv(config), {
    VISION_MODEL: "qwen3-vl:4b",
    VISION_OLLAMA_HOST: "http://127.0.0.1:11434",
    VISION_MAX_BYTES: "20971520",
    VISION_TIMEOUT_MS: "120000",
    VISION_KEEP_ALIVE: "24h",
    VISION_MAX_OUTPUT_CHARS: "12000",
    VISION_MAX_EDGE: "1280",
  });
});

test("configEnv omits VISION_ALLOWED_PATHS so generated configs inherit the shell env", () => {
  assert.equal("VISION_ALLOWED_PATHS" in configEnv(config), false);
});

test("the json format round-trips through JSON.parse with the expected shape", () => {
  const descriptor = buildMcpServerConfig({
    serverName: "local-vision",
    command: "/usr/bin/node",
    args: ["/app/bin/local-vision.mjs"],
    config,
  });
  const parsed = JSON.parse(formatMcpServerConfig(descriptor, "json"));

  assert.deepEqual(parsed, {
    mcpServers: {
      "local-vision": {
        command: "/usr/bin/node",
        args: ["/app/bin/local-vision.mjs"],
        env: configEnv(config),
      },
    },
  });
});

test("the codex format emits a valid mcp_servers TOML table", () => {
  const descriptor = buildMcpServerConfig({
    serverName: "local-vision",
    command: "/usr/bin/node",
    args: ["/app/bin/local-vision.mjs"],
    config,
  });
  const toml = formatMcpServerConfig(descriptor, "codex");

  assert.equal(toml.split("\n")[0], "[mcp_servers.local-vision]");
  assert.match(toml, /command = "\/usr\/bin\/node"/);
  assert.match(toml, /args = \["\/app\/bin\/local-vision\.mjs"\]/);
  assert.match(toml, /env = \{ VISION_MODEL = "qwen3-vl:4b", VISION_OLLAMA_HOST = "http:\/\/127\.0\.0\.1:11434", VISION_MAX_BYTES = "20971520", VISION_TIMEOUT_MS = "120000", VISION_KEEP_ALIVE = "24h", VISION_MAX_OUTPUT_CHARS = "12000", VISION_MAX_EDGE = "1280" \}/);
  assert.match(toml, /enabled = true/);
});

test("mcpConfigFormat defaults to json and normalizes generic", () => {
  assert.deepEqual(mcpConfigFormat([]), { format: "json" });
  assert.deepEqual(mcpConfigFormat(["--format", "json"]), { format: "json" });
  assert.deepEqual(mcpConfigFormat(["--format", "generic"]), { format: "json" });
  assert.deepEqual(mcpConfigFormat(["--format", "codex"]), { format: "codex" });
});

test("mcpConfigFormat rejects unknown formats", () => {
  const result = mcpConfigFormat(["--format", "claude"]);
  assert.equal(result.format, undefined);
  assert.match(result.error, /Unknown --format "claude"/);
});
