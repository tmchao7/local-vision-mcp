# Local Vision MCP

Local Ollama vision analysis for Claude Code and DeepSeek agents. The main text agent stays unchanged; it calls one local MCP tool when it needs to inspect an image.

## Requirements

- macOS or Linux
- Node.js 20+
- Ollama running locally
- `qwen3-vl:4b` available in Ollama

Check the local setup without downloading anything:

```bash
npm install
npm run doctor
```

The doctor checks Ollama reachability and whether `qwen3-vl:4b` is installed. Override the model with `VISION_MODEL`.

## Claude Code Plugin

Run Claude Code with this repository as a development plugin:

```bash
claude --plugin-dir /absolute/path/to/myVisionModel
```

The plugin provides the `local-vision` MCP server and the `vision` Skill. The MCP server accepts PNG, JPEG, and WebP paths. By default, it allows the active Claude project directory plus the current user's `Pictures`, `Desktop`, and `Downloads` directories.

The agent must still provide an explicit image path; the MCP does not scan these directories. For images in another directory, configure additional allowed paths before starting Claude Code:

```bash
export VISION_ALLOWED_PATHS="$HOME/Desktop:$HOME/Downloads"
```

## DeepSeek worker integration

Generate a trusted MCP config with an absolute server path:

```bash
node bin/local-vision.mjs --print-mcp-config > /tmp/local-vision.mcp.json
export DEEPSEEK_VISION_MCP_CONFIG=/tmp/local-vision.mcp.json
```

The DeepSeek launcher adds this config to Claude Code only when the environment variable is set. The worker also allows `mcp__local-vision__vision_analyze` in its scoped settings. No image is sent to the DeepSeek API; Ollama processes it locally and DeepSeek receives the report text.

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

`mode` is `ui`, `ocr`, or `general`. The result contains `answer`, `observations`, `visible_text`, and `uncertainties`.

## Development

```bash
npm test
npm run doctor
```

The MCP server writes protocol messages to stdout and diagnostics to stderr. It does not cache or log image bytes.
