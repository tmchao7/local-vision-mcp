import assert from "node:assert/strict";
import { test } from "node:test";
import { OllamaClient, OllamaError } from "../src/ollama-client.mjs";

test("sends an image to Ollama using the local chat API", async () => {
  const calls = [];
  const client = new OllamaClient({
    host: "http://127.0.0.1:11434",
    model: "qwen3-vl:4b",
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return {
        ok: true,
        status: 200,
        async json() {
          return { message: { content: '{"answer":"A terminal is visible."}' } };
        },
      };
    },
  });

  const result = await client.analyzeImage({
    imageBase64: "aGVsbG8=",
    mediaType: "image/png",
    question: "Describe the visible error.",
    mode: "ui",
    detail: "standard",
  });

  assert.equal(result, '{"answer":"A terminal is visible."}');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "http://127.0.0.1:11434/api/chat");
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.model, "qwen3-vl:4b");
  assert.equal(body.stream, false);
  assert.equal(body.messages[0].content.includes("Describe the visible error."), true);
  assert.deepEqual(body.messages[0].images, ["aGVsbG8="]);
});

test("classifies a missing Ollama model as a model-not-found error", async () => {
  const client = new OllamaClient({
    fetchImpl: async () => ({
      ok: false,
      status: 404,
      async text() {
        return "model qwen3-vl:4b not found";
      },
    }),
  });

  await assert.rejects(
    client.analyzeImage({
      imageBase64: "aGVsbG8=",
      mediaType: "image/png",
      mode: "ui",
      detail: "fast",
    }),
    (error) => error instanceof OllamaError && error.code === "MODEL_NOT_FOUND",
  );
});
