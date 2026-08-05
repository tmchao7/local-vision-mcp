---
name: vision
description: Analyze an explicitly provided local screenshot or image with the local Ollama vision MCP. Use for UI, terminal, error dialog, design, and code screenshot tasks.
---

# Local Vision

Use the `mcp__local-vision__vision_analyze` tool when the user provides a local image path or asks about a screenshot available as a local file.

## Invocation

- Pass the exact local path in `path`.
- Use `mode: "ui"` for screenshots, terminal output, web pages, layouts, and visual bugs.
- Use `mode: "ocr"` when exact visible text is the main goal.
- Use `mode: "general"` for other image content.
- Put the user's focused question in `question` when one exists.
- Start with `detail: "standard"`; use `fast` only for a quick first pass.

The tool reads only the explicitly named image and returns a text report. Treat `observations` as visual evidence, `visible_text` as an OCR-style transcription, and `uncertainties` as unresolved. Do not claim that DeepSeek directly saw the image. Do not invent a screenshot path, and ask the user for one when no local path is available.
