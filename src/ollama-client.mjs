import { buildVisionPrompt } from "./prompt.mjs";

// Grammar-constrained report shape (Ollama structured outputs). The model cannot
// emit fences, prose, or extra keys; only truncation can still break the payload.
export const VISION_REPORT_SCHEMA = {
  type: "object",
  properties: {
    answer: { type: "string" },
    observations: { type: "array", items: { type: "string" } },
    visible_text: { type: "array", items: { type: "string" } },
    uncertainties: { type: "array", items: { type: "string" } },
  },
  required: ["answer", "observations", "visible_text", "uncertainties"],
  additionalProperties: false,
};

// Ollama returns message.thinking wrapped in <think>...</think>. Keep the inner
// text; leave content without a wrapper untouched.
function stripThinkTags(value) {
  return String(value ?? "")
    .replace(/^\s*<think>\s*/i, "")
    .replace(/\s*<\/think>\s*$/i, "")
    .trim();
}

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
    maxOutputTokens = 4096,
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

  async analyzeImage({ images, imageBase64, mediaType, question, mode = "ui", detail = "standard" }) {
    const imageList = images?.length ? images : (imageBase64 ? [imageBase64] : []);
    const body = {
      model: this.model,
      messages: [{
        role: "user",
        content: buildVisionPrompt({ question, mode, detail, imageCount: imageList.length }),
        images: imageList,
      }],
      stream: false,
      format: VISION_REPORT_SCHEMA,
      think: false,
      keep_alive: this.keepAlive,
      options: {
        temperature: 0.1,
        top_p: 0.8,
        top_k: 20,
        min_p: 0.05,
        repeat_penalty: 1.1,
        seed: 3407,
        num_ctx: 16_384,
        num_predict: detail === "fast" ? 2048 : this.maxOutputTokens,
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

    // qwen3-vl thinking variants can put the answer in message.thinking with an
    // empty content (ollama #12831). Fall back to thinking with the tags stripped;
    // a present-but-empty content still returns empty so callers can classify it.
    const rawContent = payload?.message?.content;
    if (typeof rawContent !== "string" && typeof payload?.message?.thinking !== "string") {
      throw new OllamaError("INVALID_RESPONSE", "Ollama response did not contain message.content.");
    }
    const content = stripThinkTags(
      typeof rawContent === "string" && rawContent.trim() !== "" ? rawContent : (payload?.message?.thinking ?? ""),
    );
    return {
      content,
      truncated: payload?.done_reason === "length",
    };
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
    const startedAt = Date.now();
    let lastError;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const remainingMs = this.timeoutMs - (Date.now() - startedAt);
      if (remainingMs <= 0) {
        throw new OllamaError("TIMEOUT", `Ollama request timed out after ${this.timeoutMs}ms total.`, { retryable: false });
      }
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), remainingMs);
      try {
        const response = await this.fetchImpl(`${this.host}${path}`, { ...options, signal: controller.signal });
        if (response.ok) return response;

        const detail = typeof response.text === "function" ? await response.text() : "";
        const code = response.status === 404 && /model/i.test(detail) ? "MODEL_NOT_FOUND" : "OLLAMA_HTTP_ERROR";
        const message = code === "MODEL_NOT_FOUND" && detail === ""
          ? `Ollama model not found. Run: ollama pull ${this.model}`
          : detail || `Ollama request failed with HTTP ${response.status}.`;
        throw new OllamaError(code, message, {
          status: response.status,
          retryable: response.status >= 500,
        });
      } catch (error) {
        lastError = error;
        if (error instanceof OllamaError && !error.retryable) throw error;
        if (attempt === 1) {
          if (error?.name === "AbortError") {
            throw new OllamaError("TIMEOUT", `Ollama request timed out after ${this.timeoutMs}ms total.`, { retryable: false });
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
