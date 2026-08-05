import assert from "node:assert/strict";
import { test } from "node:test";
import { runDoctor } from "../src/doctor.mjs";

test("doctor reports Ollama reachability and the configured model", async () => {
  const result = await runDoctor({
    config: {
      ollamaHost: "http://ollama.test",
      model: "qwen3-vl:4b",
      timeoutMs: 1000,
    },
    fetchImpl: async (url) => {
      assert.equal(url, "http://ollama.test/api/tags");
      return {
        ok: true,
        status: 200,
        async json() {
          return { models: [{ name: "qwen3-vl:4b" }] };
        },
      };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.model, "qwen3-vl:4b");
  assert.equal(result.checks.ollama_reachable, true);
  assert.equal(result.checks.model_installed, true);
});
