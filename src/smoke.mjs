import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { OllamaClient } from "./ollama-client.mjs";
import { createPng } from "./png.mjs";
import { normalizeVisionReport } from "./report.mjs";

const SMOKE_QUESTION = "What color and shape is in this image? Answer in one short sentence.";

function smokePixel(x, y) {
  const inSquare = x >= 32 && x < 64 && y >= 32 && y < 64;
  return inSquare ? { r: 255, g: 165, b: 0 } : { r: 255, g: 255, b: 255 };
}

export async function runSmoke({ config, client, fetchImpl, question = SMOKE_QUESTION } = {}) {
  const visionClient = client || new OllamaClient({
    host: config.ollamaHost,
    model: config.model,
    timeoutMs: config.timeoutMs,
    keepAlive: config.keepAlive,
    fetchImpl,
  });
  const result = {
    ok: false,
    model: config.model,
    host: config.ollamaHost,
    mode: "general",
    answer: "",
    truncated: false,
  };

  let directory = null;
  try {
    directory = await mkdtemp(join(tmpdir(), "local-vision-smoke-"));
    const imagePath = join(directory, "smoke.png");
    const image = createPng({ width: 96, height: 96, pixel: smokePixel });
    await writeFile(imagePath, image);

    const analysis = await visionClient.analyzeImage({
      imageBase64: image.toString("base64"),
      mediaType: "image/png",
      question,
      mode: "general",
      detail: "fast",
    });
    result.truncated = analysis.truncated;
    const hasContent = typeof analysis.content === "string" && analysis.content.trim().length > 0;
    const report = normalizeVisionReport(analysis.content, {
      model: config.model,
      sourcePath: imagePath,
      mode: "general",
      truncated: analysis.truncated,
    });
    result.answer = report.answer;
    result.ok = report.ok && hasContent;
    if (!hasContent) result.error_code = "EMPTY_REPORT";
  } catch (error) {
    result.error_code = error?.code || "VISION_ERROR";
    result.error = error?.message || "Smoke check failed.";
  } finally {
    if (directory) await rm(directory, { recursive: true, force: true });
  }

  return result;
}
