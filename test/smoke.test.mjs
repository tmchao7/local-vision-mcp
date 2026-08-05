import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { test } from "node:test";
import { OllamaError } from "../src/ollama-client.mjs";
import { runSmoke } from "../src/smoke.mjs";

const config = {
  model: "qwen3-vl:4b",
  ollamaHost: "http://127.0.0.1:11434",
  timeoutMs: 1000,
  keepAlive: "5m",
};

// Base64 of the PNG signature as it appears inside the full-image encoding
// (11 chars, no "=" padding — padding only occurs at the end of the whole string).
const PNG_SIGNATURE = "iVBORw0KGgo";

async function leftoverSmokeDirs() {
  const entries = await readdir(tmpdir());
  return entries.filter((entry) => entry.startsWith("local-vision-smoke-"));
}

test("smoke generates a PNG and validates a populated report", async () => {
  const calls = [];
  const result = await runSmoke({
    config,
    fetchImpl: async (url, options) => {
      calls.push({ url, body: JSON.parse(options.body) });
      return {
        ok: true,
        status: 200,
        async json() {
          return { message: { content: '{"answer":"An orange square on a white background."}' } };
        },
      };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.model, "qwen3-vl:4b");
  assert.match(result.answer, /orange square/);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "http://127.0.0.1:11434/api/chat");
  assert.equal(calls[0].body.messages[0].images[0].startsWith(PNG_SIGNATURE), true);
  assert.deepEqual(await leftoverSmokeDirs(), []);
});

test("smoke reports EMPTY_REPORT when the model returns no content", async () => {
  const result = await runSmoke({
    config,
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      async json() {
        return { message: { content: "" } };
      },
    }),
  });

  assert.equal(result.ok, false);
  assert.equal(result.error_code, "EMPTY_REPORT");
  assert.deepEqual(await leftoverSmokeDirs(), []);
});

test("smoke surfaces a missing Ollama model in error_code", async () => {
  const result = await runSmoke({
    config,
    fetchImpl: async () => ({
      ok: false,
      status: 404,
      async text() {
        return "model qwen3-vl:4b not found";
      },
    }),
  });

  assert.equal(result.ok, false);
  assert.equal(result.error_code, "MODEL_NOT_FOUND");
  assert.ok(result.error);
  assert.deepEqual(await leftoverSmokeDirs(), []);
});

test("smoke accepts an injected client", async () => {
  const client = {
    async analyzeImage() {
      throw new OllamaError("OLLAMA_UNAVAILABLE", "refused", { retryable: false });
    },
  };
  const result = await runSmoke({ config, client });

  assert.equal(result.ok, false);
  assert.equal(result.error_code, "OLLAMA_UNAVAILABLE");
  assert.deepEqual(await leftoverSmokeDirs(), []);
});
