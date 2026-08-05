# Local Vision MCP

[English](README.md) | [简体中文](README.zh-CN.md)

Local Ollama vision analysis for Claude Code and other text-only agents (DeepSeek, Codex, and forks). The main text agent stays unchanged — it calls one local MCP tool when it needs to inspect an image. **No image bytes ever leave the machine**: Ollama processes the image locally, and the agent's model receives only the text report.

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
  "question": "What UI error is visible?",
  "mode": "ui",
  "detail": "standard"
}
```

- `mode`: `ui` (screenshots, layouts, visual bugs), `ocr` (exact visible text), or `general`
- `detail`: `standard` (default) or `fast` (quicker first pass)
- Result fields: `answer`, `observations`, `visible_text`, `uncertainties`; failures return `error_code` with `isError: true`

## Configuration

All settings have defaults; only `VISION_ALLOWED_PATHS` is commonly needed. Variables apply in plugin mode too (forwarded by `.mcp.json`).

| Variable | Default | Purpose |
|---|---|---|
| `VISION_MODEL` | `qwen3-vl:4b` | Ollama vision model |
| `VISION_OLLAMA_HOST` | `http://127.0.0.1:11434` | Ollama endpoint |
| `VISION_ALLOWED_PATHS` | (empty) | Extra allowed image directories, `:`-separated |
| `VISION_TIMEOUT_MS` | `90000` | Total request budget across both attempts |
| `VISION_MAX_BYTES` | `20971520` | Image size limit (20 MiB) |
| `VISION_MAX_OUTPUT_CHARS` | `12000` | Report text cap |
| `VISION_KEEP_ALIVE` | `5m` | Ollama model keep-alive |

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

Each `vision_analyze` call logs duration, model, mode, and `ok`/`error_code`; startup logs the resolved config. The server does not cache or log image bytes.
