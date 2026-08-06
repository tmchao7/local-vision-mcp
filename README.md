# Local Vision MCP

[English](README.md) | [简体中文](README.zh-CN.md)

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D20-green.svg)
![MCP](https://img.shields.io/badge/MCP-stdio%20server-8A2BE2.svg)

Local Ollama vision analysis for Claude Code and other text-only agents (DeepSeek, Codex, and forks). The main text agent stays unchanged — it calls one local MCP tool when it needs to inspect an image. **No image bytes ever leave the machine**: Ollama processes the image locally, and the agent's model receives only the text report.

## Features

- **Local & private** — images go to a local Ollama model over `localhost`; nothing is ever uploaded to a text LLM API.
- **One tool, text in / text out** — `vision_analyze` takes an explicit image path (optionally a second path for before/after comparison) and returns a structured text report.
- **Vision modes** — `ui` (screenshots, layouts, visual bugs), `ocr` (exact visible text), and `general`; `standard` or `fast` detail.
- **Grammar-constrained structured output** — the model must emit valid JSON per schema (Ollama structured outputs); truncated output is surfaced via a `truncated` flag instead of silently degrading.
- **Safe input handling** — path allowlist with symlink-escape protection, PNG/JPEG/WebP only, 20 MiB cap, and local downscaling of oversized PNGs before they reach Ollama.
- **Drop-in for text-only agents** — Claude Code (plugin or user-scope MCP), DeepSeek workers, and Codex derivatives; diagnostics stay on stderr so the MCP protocol stays clean.

## Quick start

```bash
npm install
npm run doctor                # verify Ollama + model are ready
claude --plugin-dir /absolute/path/to/myVisionModel
```

Then just ask in the conversation, e.g. *"Analyze `screenshot.png` — what error is visible?"*

## Requirements

- macOS or Linux
- Node.js 20+
- Ollama running locally
- `qwen3-vl:4b` available in Ollama (`ollama pull qwen3-vl:4b`)

`npm run doctor` checks Ollama reachability and whether the model is installed, without downloading anything. Override the model with `VISION_MODEL`.

## How it works

```
agent → vision_analyze(path[, secondary_path])     path allowlist + PNG downscale
      → POST /api/chat  →  local Ollama             grammar-constrained JSON Schema
      → structured text report                      answer / observations / visible_text / uncertainties / truncated
      → agent receives text only                    no image bytes ever reach the text LLM
```

## Claude Code plugin

Run Claude Code with this repository as a development plugin:

```bash
claude --plugin-dir /absolute/path/to/myVisionModel
```

The plugin provides the `local-vision` MCP server and the `vision` Skill. The server accepts PNG, JPEG, and WebP paths. By default it allows the active Claude project directory plus the current user's `Pictures`, `Desktop`, and `Downloads` directories.

The agent must still provide an explicit image path; the MCP does not scan these directories. For images elsewhere, configure additional allowed paths before starting Claude Code:

```bash
export VISION_ALLOWED_PATHS="$HOME/Designs:$HOME/Documents"
```

### Available in every project (global)

`--plugin-dir` only affects the session it launches. To use the vision capability in **all** projects, register the server once at the user scope and link the skill into your personal skills directory:

```bash
claude mcp add local-vision -s user -- "$(which node)" /absolute/path/to/myVisionModel/bin/local-vision.mjs
ln -s /absolute/path/to/myVisionModel/skills/vision ~/.claude/skills/vision
```

The tool then appears as `mcp__local-vision__vision_analyze` in every Claude Code session. Pass any `VISION_*` overrides with `-e KEY=value` on the `claude mcp add` command, or set them in your shell.

## DeepSeek worker integration

Generate a trusted MCP config with an absolute server path:

```bash
node bin/local-vision.mjs --print-mcp-config > /tmp/local-vision.mcp.json
export DEEPSEEK_VISION_MCP_CONFIG=/tmp/local-vision.mcp.json
```

The DeepSeek launcher adds this config to Claude Code only when the environment variable is set, and allows `mcp__local-vision__vision_analyze` in its scoped settings. No image is sent to the DeepSeek API; Ollama processes it locally and DeepSeek receives the report text.

The generated config carries all `VISION_*` defaults (model, host, limits) except `VISION_ALLOWED_PATHS`, which is inherited from your shell environment — set it before launching the agent when images live outside the default directories.

## Other agents (Codex, zcode, mimocode)

The server is a plain stdio MCP server; the only Claude-specific pieces are `CLAUDE_PROJECT_DIR` (falls back to cwd) and the plugin files. Codex derivatives (zcode, mimocode) accept the same JSON config as Claude Code; Codex itself uses a TOML table:

```bash
node bin/local-vision.mjs --print-mcp-config --format codex > /tmp/local-vision.toml
```

Append the emitted `[mcp_servers.local-vision]` table to `~/.codex/config.toml` (or a project `.codex/config.toml`).

## MCP tool

`vision_analyze` accepts:

```json
{
  "path": "/absolute/path/to/screenshot.png",
  "secondary_path": "/absolute/path/to/screenshot-after.png",
  "question": "What UI error is visible?",
  "mode": "ui",
  "detail": "standard"
}
```

- `mode`: `ui` (screenshots, layouts, visual bugs), `ocr` (exact visible text), or `general`
- `detail`: `standard` (default) or `fast` (quicker first pass)
- `secondary_path` (optional): a second image to compare against the first (before/after screenshots); both are sent in one call
- Result fields: `answer`, `observations`, `visible_text`, `uncertainties`, `truncated` (true when the model hit its output limit); failures return `error_code` with `isError: true`

The report is constrained by a JSON Schema (Ollama structured outputs), so the model cannot emit fences or prose — only a truncated payload can degrade it, and that is surfaced via `truncated`. This requires an Ollama model with structured-outputs support (qwen3-vl, gemma3, llama3.2-vision; llava and older models may reject the schema — run `npm run smoke` after switching models). PNG images larger than `VISION_MAX_EDGE` are downscaled locally before being sent; JPEG/WebP pass through and Ollama handles them.

## Configuration

All settings have defaults; only `VISION_ALLOWED_PATHS` is commonly needed. Variables apply in plugin mode too (forwarded by `.mcp.json`).

| Variable | Default | Purpose |
|---|---|---|
| `VISION_MODEL` | `qwen3-vl:4b` | Ollama vision model |
| `VISION_OLLAMA_HOST` | `http://127.0.0.1:11434` | Ollama endpoint |
| `VISION_ALLOWED_PATHS` | (empty) | Extra allowed image directories, `:`-separated |
| `VISION_TIMEOUT_MS` | `120000` | Total request budget across both attempts |
| `VISION_MAX_BYTES` | `20971520` | Image size limit (20 MiB) |
| `VISION_MAX_EDGE` | `1280` | Longest PNG edge (px) before local downscaling |
| `VISION_MAX_OUTPUT_CHARS` | `12000` | Report text cap |
| `VISION_KEEP_ALIVE` | `24h` | Ollama model keep-alive (avoids cold starts) |

## Project structure

```
bin/local-vision.mjs      entry point: --doctor / --smoke / --print-mcp-config / stdio MCP server
src/server.mjs            the vision_analyze tool (single-exit handler, structured errors)
src/validation.mjs        path allowlist + type/size checks (symlink-safe realpath)
src/ollama-client.mjs     Ollama /api/chat client (retries, total timeout budget, structured output)
src/prompt.mjs            mode/detail prompt builder with injection defense + scanner contract
src/report.mjs            tolerant JSON normalization + truncated flag
src/png.mjs, resize.mjs   zero-dependency in-memory PNG build / decode + downscale
src/config.mjs            all VISION_* env config + path allowlist roots
skills/vision/SKILL.md    Claude Code skill (when/how to call the tool)
test/                     node:test suite (network-free, injected fetchImpl)
```

## Troubleshooting

| `error_code` | Meaning | Fix |
|---|---|---|
| `MODEL_NOT_FOUND` | Model not installed | `ollama pull qwen3-vl:4b` |
| `OLLAMA_UNAVAILABLE` | Ollama not running | Start Ollama (`ollama serve`) |
| `TIMEOUT` | Budget of `VISION_TIMEOUT_MS` exceeded | Raise `VISION_TIMEOUT_MS` |
| `PATH_NOT_ALLOWED` | Image outside allowed directories | Set `VISION_ALLOWED_PATHS` |
| `FILE_TOO_LARGE` | Over `VISION_MAX_BYTES` | Compress the image or raise the limit |
| `EMPTY_REPORT` | Model returned no content (`--smoke`) | Check the model is a vision model |

## Development

```bash
npm test        # node:test suite (network-free)
npm run doctor  # Ollama reachability + model installed
npm run smoke   # real end-to-end: generates a test PNG, asks Ollama, validates the report
```

`npm run smoke` requires a running Ollama with the configured model; it exits 0 only when the full chain works.

## Debug logging

Diagnostics go to stderr only (stdout stays protocol-clean). Enable them with `--debug` or `LOG_LEVEL=debug`:

```bash
LOG_LEVEL=debug node bin/local-vision.mjs
```

Each `vision_analyze` call logs duration, model, mode, `ok`/`error_code`, `truncated`, and image count; startup logs the resolved config. The server does not cache or log image bytes.

## License

MIT © 2026. See [LICENSE](LICENSE).
