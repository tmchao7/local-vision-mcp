import assert from "node:assert/strict";
import { test } from "node:test";
import { OllamaClient, OllamaError, VISION_REPORT_SCHEMA } from "../src/ollama-client.mjs";

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

  assert.equal(result.content, '{"answer":"A terminal is visible."}');
  assert.equal(result.truncated, false);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "http://127.0.0.1:11434/api/chat");
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.model, "qwen3-vl:4b");
  assert.equal(body.stream, false);
  assert.deepEqual(body.format, VISION_REPORT_SCHEMA, "grammar-constrained schema");
  assert.equal(body.think, false, "thinking disabled for analysis tasks");
  assert.equal(body.messages[0].content.includes("Describe the visible error."), true);
  assert.deepEqual(body.messages[0].images, ["aGVsbG8="]);
  assert.equal(body.options.num_predict, 4096);
  assert.equal(body.options.temperature, 0.1);
  assert.equal(body.options.top_p, 0.8);
  assert.equal(body.options.top_k, 20);
  assert.equal(body.options.min_p, 0.05);
  assert.equal(body.options.repeat_penalty, 1.1);
  assert.equal(body.options.seed, 3407);
  assert.equal(body.options.num_ctx, 16_384);
});

test("marks a response truncated when Ollama reports done_reason length", async () => {
  const client = new OllamaClient({
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      async json() {
        return {
          message: { content: '{"answer":"partial' },
          done_reason: "length",
        };
      },
    }),
  });

  const result = await client.analyzeImage({ imageBase64: "aGVsbG8=", mode: "ui" });
  assert.equal(result.content, '{"answer":"partial');
  assert.equal(result.truncated, true);
});

test("falls back to message.thinking when content is missing", async () => {
  const client = new OllamaClient({
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      async json() {
        return { message: { thinking: "<think>\nIt is a square.\n</think>" } };
      },
    }),
  });

  const result = await client.analyzeImage({ imageBase64: "aGVsbG8=", mode: "ui" });
  assert.equal(result.content, "It is a square.");
});

test("uses a smaller token budget for fast detail", async () => {
  const calls = [];
  const client = new OllamaClient({
    fetchImpl: async (url, options) => {
      calls.push(options);
      return {
        ok: true,
        status: 200,
        async json() {
          return { message: { content: "{}" } };
        },
      };
    },
  });

  await client.analyzeImage({
    imageBase64: "aGVsbG8=",
    mediaType: "image/png",
    mode: "ui",
    detail: "fast",
  });

  assert.equal(JSON.parse(calls[0].body).options.num_predict, 2048);
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
