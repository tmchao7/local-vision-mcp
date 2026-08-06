import { readFile } from "node:fs/promises";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readConfig } from "./config.mjs";
import { createLogger, isDebugEnabled } from "./log.mjs";
import { OllamaClient } from "./ollama-client.mjs";
import { createVisionError, normalizeVisionReport, reportToText } from "./report.mjs";
import { pngDimensions, resizePng } from "./resize.mjs";
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
  truncated: z.boolean(),
  error_code: z.string().optional(),
};

function resultFor(report) {
  return {
    content: [{ type: "text", text: reportToText(report) }],
    structuredContent: report,
    ...(report.ok ? {} : { isError: true }),
  };
}

async function loadImage(path, config) {
  const image = await validateImageInput(path, {
    projectDir: config.projectDir,
    allowedPaths: config.allowedPaths,
    maxBytes: config.maxBytes,
  });
  const bytes = await readFile(image.path);
  // PNG screenshots get downscaled to the qwen3-vl token sweet spot
  // (longest edge <= maxEdge); JPEG/WebP pass through and Ollama handles them.
  const dims = image.mediaType === "image/png" ? pngDimensions(bytes) : null;
  if (dims && (dims.width > config.maxEdge || dims.height > config.maxEdge)) {
    const resized = resizePng(bytes, config.maxEdge);
    if (resized) return { image, bytes: resized, originalDims: dims };
  }
  return { image, bytes };
}

export function createVisionServer({ config = readConfig(), client, fetchImpl, log } = {}) {
  const logger = log || createLogger({ debug: isDebugEnabled() });
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
        secondary_path: z.string().min(1).optional().describe("Optional second image to compare against the first (e.g. before/after screenshots)."),
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
    async ({ path, secondary_path: secondaryPath, question, mode, detail }) => {
      const startedAt = Date.now();
      const context = {
        model: config.model,
        sourcePath: path,
        mode,
        maxOutputChars: config.maxOutputChars,
      };

      let report;
      try {
        const primary = await loadImage(path, config);
        const secondary = secondaryPath ? await loadImage(secondaryPath, config) : null;
        for (const loaded of [primary, secondary]) {
          if (loaded?.originalDims) {
            logger.debug(`downscaled ${loaded.originalDims.width}x${loaded.originalDims.height} to ${loaded.bytes.readUInt32BE(16)}x${loaded.bytes.readUInt32BE(20)}`);
          }
        }
        const analysis = await visionClient.analyzeImage({
          images: secondary
            ? [primary.bytes.toString("base64"), secondary.bytes.toString("base64")]
            : undefined,
          imageBase64: secondary ? undefined : primary.bytes.toString("base64"),
          mediaType: primary.image.mediaType,
          question,
          mode,
          detail,
        });
        logger.debug(`raw_output=${JSON.stringify(analysis.content.slice(0, 200))}${analysis.content.length > 200 ? "…" : ""}`);
        report = normalizeVisionReport(analysis.content, {
          ...context,
          sourcePath: primary.image.path,
          truncated: analysis.truncated,
        });
      } catch (error) {
        report = createVisionError(error, context);
      }
      logger.info(
        `${Date.now() - startedAt}ms model=${config.model} mode=${mode} detail=${detail} ok=${report.ok}`,
        report.error_code ? `error_code=${report.error_code}` : undefined,
        report.truncated ? "truncated=true" : undefined,
        secondaryPath ? "images=2" : undefined,
      );
      return resultFor(report);
    },
  );

  return { server, client: visionClient, config };
}
