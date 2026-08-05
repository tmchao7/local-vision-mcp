import { OllamaClient } from "./ollama-client.mjs";

export async function runDoctor({ config, client, fetchImpl } = {}) {
  const visionClient = client || new OllamaClient({
    host: config.ollamaHost,
    model: config.model,
    timeoutMs: config.timeoutMs,
    keepAlive: config.keepAlive,
    fetchImpl,
  });
  const checks = {
    ollama_reachable: false,
    model_installed: false,
  };
  const result = {
    ok: false,
    host: config.ollamaHost,
    model: config.model,
    checks,
  };

  try {
    const models = await visionClient.listModels();
    checks.ollama_reachable = true;
    checks.model_installed = models.some((model) => model?.name === config.model);
    result.ok = checks.ollama_reachable && checks.model_installed;
    if (!checks.model_installed) result.error_code = "MODEL_NOT_FOUND";
  } catch (error) {
    result.error_code = error?.code || "OLLAMA_UNAVAILABLE";
    result.error = error?.message || "Could not reach Ollama.";
  }

  return result;
}
