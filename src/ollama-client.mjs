import { buildVisionPrompt } from "./prompt.mjs";

export class OllamaError extends Error {
  constructor(code, message, options = {}) {
    super(message);
    this.name = "OllamaError";
    this.code = code;
    this.status = options.status;
    this.retryable = Boolean(options.retryable);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class OllamaClient {
  constructor({
    host = "http://127.0.0.1:11434",
    model = "qwen3-vl:4b",
    timeoutMs = 90_000,
    keepAlive = "5m",
    maxOutputTokens = 2048,
    fetchImpl = globalThis.fetch,
  } = {}) {
    if (typeof fetchImpl !== "function") {
      throw new Error("A fetch implementation is required.");
    }
    this.host = host.replace(/\/$/, "");
    this.model = model;
    this.timeoutMs = timeoutMs;
    this.keepAlive = keepAlive;
    this.maxOutputTokens = maxOutputTokens;
    this.fetchImpl = fetchImpl;
  }

  async analyzeImage({ imageBase64, mediaType, question, mode = "ui", detail = "standard" }) {
    const body = {
      model: this.model,
      messages: [{
        role: "user",
        content: buildVisionPrompt({ question, mode, detail }),
        images: [imageBase64],
      }],
      stream: false,
      format: "json",
      keep_alive: this.keepAlive,
      options: {
        temperature: 0.1,
        num_predict: detail === "fast" ? 1024 : this.maxOutputTokens,
      },
    };
    void mediaType;

    const response = await this.#request("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new OllamaError("INVALID_RESPONSE", "Ollama returned invalid JSON.");
    }

    const content = payload?.message?.content;
    if (typeof content !== "string") {
      throw new OllamaError("INVALID_RESPONSE", "Ollama response did not contain message.content.");
    }
    return content;
  }

  async listModels() {
    const response = await this.#request("/api/tags", { method: "GET" });
    try {
      const payload = await response.json();
      return Array.isArray(payload?.models) ? payload.models : [];
    } catch {
      throw new OllamaError("INVALID_RESPONSE", "Ollama returned invalid model metadata.");
    }
  }

  async #request(path, options) {
    let lastError;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const response = await this.fetchImpl(`${this.host}${path}`, { ...options, signal: controller.signal });
        if (response.ok) return response;

        const detail = typeof response.text === "function" ? await response.text() : "";
        const code = response.status === 404 && /model/i.test(detail) ? "MODEL_NOT_FOUND" : "OLLAMA_HTTP_ERROR";
        throw new OllamaError(code, detail || `Ollama request failed with HTTP ${response.status}.`, {
          status: response.status,
          retryable: response.status >= 500,
        });
      } catch (error) {
        lastError = error;
        if (error instanceof OllamaError && !error.retryable) throw error;
        if (attempt === 1) {
          if (error?.name === "AbortError") {
            throw new OllamaError("TIMEOUT", `Ollama request timed out after ${this.timeoutMs}ms.`, { retryable: false });
          }
          if (error instanceof OllamaError) throw error;
          throw new OllamaError("OLLAMA_UNAVAILABLE", `Could not reach Ollama: ${error.message}`, { retryable: false });
        }
        await sleep(150);
      } finally {
        clearTimeout(timeout);
      }
    }
    throw lastError;
  }
}
