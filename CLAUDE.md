# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

A local MCP server that gives text-only coding agents (Claude Code, DeepSeek/Codex workers) vision capability via a locally deployed Ollama vision model. The agent calls one tool, `vision_analyze`, with an explicit local image path; the image is sent to Ollama over localhost and the agent receives a text report. **No image bytes ever reach the text LLM API** — this is the core privacy invariant.

## Commands

```bash
npm test                    # all tests (node:test runner)
npm run test:unit           # same as above
npm test -- test/server.test.mjs   # single test file
node --test --test-name-pattern="retries" test/ollama-client.test.mjs  # single test by name
npm run doctor              # health check: Ollama reachable + model installed
npm run smoke               # real end-to-end vs local Ollama (generates a PNG in memory)
node bin/local-vision.mjs --print-mcp-config [--format json|codex]  # emit trusted MCP config
```

No build step, no linter, no TypeScript. Plain ESM (`"type": "module"`), `.mjs` files, Node 20+.

## Architecture

Flow: agent → MCP tool call → `loadImage` (`validateImageInput` path allowlist + optional PNG downscale) → `OllamaClient.analyzeImage` → prompt (+ `[img]` markers for two images) + base64 image(s) to Ollama `/api/chat` (grammar-constrained JSON Schema) → `normalizeVisionReport` → structured result with `truncated` flag.

- `bin/local-vision.mjs` — entry point. Four modes: `--doctor`, `--smoke`, `--print-mcp-config` (with `--format json|codex`), or default stdio MCP server. Must never be imported by tests (it connects the transport at module scope); all shareable logic lives in `src/`.
- `src/config.mjs` — all config from env (`VISION_*` vars, falls back to `OLLAMA_HOST`). Builds the path allowlist: `CLAUDE_PROJECT_DIR` + user `Pictures`/`Desktop`/`Downloads` + `VISION_ALLOWED_PATHS` (delimiter-split).
- `src/server.mjs` — `createVisionServer({ config, client, fetchImpl, log })`. Registers the single `vision_analyze` tool with a zod schema (`path` + optional `secondary_path` for image comparison); the handler is single-exit through `resultFor`, downscales oversized PNGs via `loadImage`, and logs per-call duration/ok/error_code/truncated/images plus a raw-output snippet at debug level. Returns `{ server, client, config }` — deps injectable for tests.
- `src/validation.mjs` — `VisionInputError` with codes (`INVALID_PATH`, `FILE_NOT_FOUND`, `PATH_NOT_ALLOWED`, `UNSUPPORTED_TYPE`, `NOT_A_FILE`, `FILE_TOO_LARGE`). Allowlist check uses `realpath` on both the candidate and the allowed roots to defeat symlink escapes. PNG/JPEG/WebP only, 20 MB cap.
- `src/ollama-client.mjs` — `OllamaClient` with `fetchImpl` injected (never real network in tests). `analyzeImage` (POST `/api/chat`, `stream: false`, `format` = `VISION_REPORT_SCHEMA` (grammar-constrained JSON Schema, exported for tests), `think: false`, temp 0.1 / top_p 0.8 / top_k 20 / min_p 0.05 / repeat_penalty 1.1 / fixed seed 3407 / `num_ctx` 16384, `num_predict` 4096 standard / 2048 fast) and `listModels` (GET `/api/tags`). Returns `{ content, truncated }` (`truncated` = Ollama `done_reason: "length"`); falls back to `message.thinking` (tags stripped) when content is missing — qwen3-vl thinking variants can put the answer there (ollama #12831). `timeoutMs` is a **total budget across both attempts** — a first-attempt timeout consumes it and never retries (worst case ~120s, not 240s); 5xx/network errors retry once with the remaining budget. `OllamaError` codes: `MODEL_NOT_FOUND` (message appends the `ollama pull` hint), `OLLAMA_HTTP_ERROR`, `OLLAMA_UNAVAILABLE`, `TIMEOUT`, `INVALID_RESPONSE`.
- `src/prompt.mjs` — `buildVisionPrompt({ question, mode, detail, imageCount })`; mode guidance for `ui`/`ocr`/`general`, detail line for `fast`/`standard`, a single-line JSON few-shot example, an injection-defense line, and a **describe-only scanner contract** (no advice/fixes/opinions, explicit uncertainty instead of guessing; OCR transcribes verbatim with `[?]` for uncertain characters). For `imageCount > 1` it prepends `[img]` markers (one per image, mapped to the Ollama `images` array in order) plus compare guidance referencing Image 1/Image 2.
- `src/report.mjs` — tolerant normalization of model output: strips ```json fences, accepts aliases (`summary`/`report`, `visibleText`, `text_seen`, `uncertain`), caps every string (`maxOutputChars`, 1000 per list item), lists capped at 24 items, and carries a `truncated` flag from context. When `JSON.parse` fails it retries with one closing brace appended — real qwen3-vl output truncates mid-JSON after a complete value, and that free repair recovers the structured report (observed in the real `--smoke` run). Other unparseable output (mid-string truncation, arrays, fenced-with-prose) falls back to raw text as `answer`. `createVisionError` turns any thrown error into a structured report with `error_code`.
- `src/log.mjs` — `createLogger` + `isDebugEnabled` (`--debug` flag or `LOG_LEVEL` ∈ debug/trace/1). All output to stderr, off by default so plugin mode and tests behave identically.
- `src/doctor.mjs` — health check used by `--doctor`.
- `src/png.mjs` — zero-dependency in-memory truecolor PNG builder (`node:zlib` deflate + CRC32 with a table fallback for Node <20.15); used by smoke and by resize's re-encode.
- `src/resize.mjs` — zero-dependency PNG decoder (8-bit RGB/RGBA only; inflate + all four filters) and bilinear downscaler. `pngDimensions` / `decodePng` return null for unsupported input so callers pass the original through; `resizePng(buffer, maxEdge)` returns null when already small enough. Screenshots over `VISION_MAX_EDGE` are downscaled locally in the server handler.
- `src/smoke.mjs` — `runSmoke`, the real end-to-end check behind `--smoke`: builds a 96×96 orange-square PNG, calls `analyzeImage` directly (bypasses the path allowlist), flags empty model output as `EMPTY_REPORT`, always cleans up its tmp dir.
- `src/mcp-config.mjs` — `configEnv` (7 resolved `VISION_*` values, deliberately **omits `VISION_ALLOWED_PATHS`** — the resolved list can't round-trip and an explicit empty value would clobber the shell env), `formatMcpServerConfig` (json or codex TOML via JSON.stringify escapes — a valid TOML basic-string subset), `mcpConfigFormat` (`generic` normalizes to `json`, unknown → error).
- `skills/vision/SKILL.md` — Claude Code skill describing when/how to invoke the tool; keep in sync with the tool's behavior.

## Conventions that matter

- **MCP protocol on stdout, diagnostics on stderr.** Never print to stdout outside the protocol/doctor/smoke/config modes.
- **Errors are structured results, not throws.** `server.mjs` catches everything and returns `resultFor(...)` with `isError: true` plus `error_code` — the tool handler never rejects.
- **No caching, no logging of image bytes.** README states this explicitly; keep it true.
- **Config lives in three places that must stay in sync**: `src/config.mjs` defaults, `.mcp.json` env block (all 8 `VISION_*` keys with `${VAR:-default}` expansion, asserted by `test/mcp-json.test.mjs`), and `src/mcp-config.mjs` `configEnv` (7 keys — no `VISION_ALLOWED_PATHS`). Add a new env var to all three plus the test's `expectedDefaults`.
- The plugin context is Claude Code-specific: `.mcp.json` uses `${CLAUDE_PLUGIN_ROOT}`; `--print-mcp-config` (json or codex TOML) exists for external launchers (DeepSeek worker reads the json from `DEEPSEEK_VISION_MCP_CONFIG`; codex/zcode/mimocode get either format).
- Vision quality depends on the prompt contract (`src/prompt.mjs`) and the tolerant parsing in `src/report.mjs` — if a model's output format changes, fix parsing there, not in `server.mjs`.
- Tests never touch the network: they inject `fetchImpl` (client tests) or `fetchImpl`/`config`/`log` into `createVisionServer` (server test via `InMemoryTransport` from the SDK). The one real-network path is `npm run smoke`, which is opt-in.
- `qwen3-vl:4b` is the default model but `VISION_MODEL` may point at any Ollama vision model; never hardcode model-specific behavior.
