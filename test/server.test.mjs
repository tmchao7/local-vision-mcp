import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createVisionServer } from "../src/server.mjs";

test("exposes vision_analyze and returns structured local vision output", async () => {
  const root = await mkdtemp(join(tmpdir(), "local-vision-server-"));
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "0.1.0" });
  const vision = createVisionServer({
    config: {
      projectDir: root,
      allowedPaths: [root],
      model: "qwen3-vl:4b",
      maxBytes: 1024,
      ollamaHost: "http://ollama.test",
      timeoutMs: 1000,
      keepAlive: "5m",
      maxOutputChars: 12000,
    },
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      async json() {
        return { message: { content: '{"answer":"A terminal is visible.","observations":["An error banner is visible."],"visible_text":["Build failed"],"uncertainties":[]}' } };
      },
    }),
  });

  try {
    await writeFile(join(root, "error.png"), Buffer.from("png"));
    await vision.server.connect(serverTransport);
    await client.connect(clientTransport);

    const tools = await client.listTools();
    assert.deepEqual(tools.tools.map((tool) => tool.name), ["vision_analyze"]);

    const result = await client.callTool({
      name: "vision_analyze",
      arguments: {
        path: "error.png",
        question: "What failed?",
        mode: "ui",
        detail: "standard",
      },
    });

    assert.equal(result.isError, undefined);
    assert.equal(result.structuredContent.ok, true);
    assert.equal(result.structuredContent.model, "qwen3-vl:4b");
    assert.equal(result.structuredContent.answer, "A terminal is visible.");
    assert.match(result.content[0].text, /Build failed/);
  } finally {
    await client.close().catch(() => {});
    await vision.server.close().catch(() => {});
    await rm(root, { recursive: true, force: true });
  }
});
