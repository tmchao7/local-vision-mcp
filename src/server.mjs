import { readFile } from "node:fs/promises";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readConfig } from "./config.mjs";
import { OllamaClient } from "./ollama-client.mjs";
import { createVisionError, normalizeVisionReport, reportToText } from "./report.mjs";
import { validateImageInput } from "./validation.mjs";

export const SERVER_NAME = "local-vision";
export const SERVER_VERSION = "0.1.0";

const outputSchema = {
  ok: z.boolean(),
  model: z.string(),
  source_path: z.string(),
  mode: z.string(),
  answer: z.string(),
  observations: z.array(z.string()),
  visible_text: z.array(z.string()),
  uncertainties: z.array(z.string()),
  error_code: z.string().optional(),
};

function resultFor(report) {
  return {
    content: [{ type: "text", text: reportToText(report) }],
    structuredContent: report,
    ...(report.ok ? {} : { isError: true }),
  };
}

export function createVisionServer({ config = readConfig(), client, fetchImpl } = {}) {
  const visionClient = client || new OllamaClient({
    host: config.ollamaHost,
    model: config.model,
    timeoutMs: config.timeoutMs,
    keepAlive: config.keepAlive,
    fetchImpl,
  });
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });

  server.registerTool(
    "vision_analyze",
    {
      title: "Analyze a local image",
      description: "Use the local Ollama vision model to analyze an explicitly provided PNG, JPEG, or WebP image. Reports observations, visible text, and uncertainties.",
      inputSchema: {
        path: z.string().min(1).describe("Absolute image path or path relative to the current Claude project."),
        question: z.string().max(2_000).optional().describe("The specific visual question to answer."),
        mode: z.enum(["ui", "ocr", "general"]).default("ui").describe("Analysis focus."),
        detail: z.enum(["fast", "standard"]).default("standard").describe("Response detail level."),
      },
      outputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ path, question, mode, detail }) => {
      const context = {
        model: config.model,
        sourcePath: path,
        mode,
        maxOutputChars: config.maxOutputChars,
      };

      try {
        const image = await validateImageInput(path, {
          projectDir: config.projectDir,
          allowedPaths: config.allowedPaths,
          maxBytes: config.maxBytes,
        });
        const imageBytes = await readFile(image.path);
        const raw = await visionClient.analyzeImage({
          imageBase64: imageBytes.toString("base64"),
          mediaType: image.mediaType,
          question,
          mode,
          detail,
        });
        return resultFor(normalizeVisionReport(raw, {
          ...context,
          sourcePath: image.path,
        }));
      } catch (error) {
        return resultFor(createVisionError(error, context));
      }
    },
  );

  return { server, client: visionClient, config };
}
