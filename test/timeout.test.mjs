import assert from "node:assert/strict";
import { test } from "node:test";
import { OllamaClient, OllamaError } from "../src/ollama-client.mjs";

function okResponse() {
  return {
    ok: true,
    status: 200,
    async json() {
      return { message: { content: "{}" } };
    },
  };
}

test("treats the timeout as a total budget across both attempts", async () => {
  const calls = [];
  const client = new OllamaClient({
    timeoutMs: 100,
    fetchImpl: async (url, options) => {
      calls.push(url);
      return new Promise((resolve, reject) => {
        options.signal.addEventListener("abort", () => {
          const error = new Error("The operation was aborted.");
          error.name = "AbortError";
          reject(error);
        });
      });
    },
  });

  await assert.rejects(
    client.analyzeImage({ imageBase64: "aGVsbG8=", mediaType: "image/png", mode: "ui" }),
    (error) => error instanceof OllamaError && error.code === "TIMEOUT" && /total/.test(error.message),
  );
  assert.equal(calls.length, 1, "the first timeout must exhaust the budget, no second attempt");
});

test("retries a transient 5xx once with the remaining budget", async () => {
  const calls = [];
  const client = new OllamaClient({
    timeoutMs: 10_000,
    fetchImpl: async () => {
      calls.push(1);
      if (calls.length === 1) {
        return { ok: false, status: 503, async text() { return "boom"; } };
      }
      return okResponse();
    },
  });

  const result = await client.analyzeImage({ imageBase64: "aGVsbG8=", mediaType: "image/png", mode: "ui" });
  assert.equal(result.content, "{}");
  assert.equal(calls.length, 2);
});

test("retries a network failure once, then reports the last error", async () => {
  const calls = [];
  const client = new OllamaClient({
    timeoutMs: 10_000,
    fetchImpl: async () => {
      calls.push(1);
      throw new Error("connection refused");
    },
  });

  await assert.rejects(
    client.analyzeImage({ imageBase64: "aGVsbG8=", mediaType: "image/png", mode: "ui" }),
    (error) => error instanceof OllamaError && error.code === "OLLAMA_UNAVAILABLE",
  );
  assert.equal(calls.length, 2);
});
