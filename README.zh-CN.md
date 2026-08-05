# Local Vision MCP

[English](README.md) | [简体中文](README.zh-CN.md)

面向 Claude Code 及其他纯文本 agent（DeepSeek、Codex 及其分支）的本地 Ollama 视觉分析服务。主文本 agent 保持原样——需要看图时调用一个本地 MCP 工具即可。**图片字节永远不会离开本机**：图片由本地 Ollama 处理，agent 的模型只收到文字报告。

## 快速开始

```bash
npm install
npm run doctor                # 验证 Ollama 与模型就绪
claude --plugin-dir /absolute/path/to/myVisionModel
```

然后在对话中直接提问，例如 *"分析一下 `screenshot.png`，能看到什么报错？"*

## 环境要求

- macOS 或 Linux
- Node.js 20+
- 本地已运行 Ollama
- Ollama 中已有 `qwen3-vl:4b`（`ollama pull qwen3-vl:4b`）

`npm run doctor` 无需下载任何东西即可检查 Ollama 是否可达、模型是否已安装。可用 `VISION_MODEL` 覆盖默认模型。

## Claude Code 插件

以开发插件方式运行 Claude Code：

```bash
claude --plugin-dir /absolute/path/to/myVisionModel
```

插件提供 `local-vision` MCP 服务与 `vision` Skill。服务接受 PNG、JPEG、WebP 路径。默认允许当前 Claude 项目目录以及用户主目录下的 `Pictures`、`Desktop`、`Downloads`。

agent 必须显式提供图片路径，MCP 不会扫描这些目录。图片在其他目录时，启动 Claude Code 前配置额外的允许路径：

```bash
export VISION_ALLOWED_PATHS="$HOME/Designs:$HOME/Documents"
```

## DeepSeek worker 接入

生成带绝对服务路径的可信 MCP 配置：

```bash
node bin/local-vision.mjs --print-mcp-config > /tmp/local-vision.mcp.json
export DEEPSEEK_VISION_MCP_CONFIG=/tmp/local-vision.mcp.json
```

DeepSeek launcher 仅在该环境变量设置时才把此配置加入 Claude Code，并在其作用域设置中放行 `mcp__local-vision__vision_analyze`。图片不会发送到 DeepSeek API；Ollama 本地处理图片，DeepSeek 只收到报告文本。

生成的配置携带全部 `VISION_*` 默认值（模型、地址、限额），但不含 `VISION_ALLOWED_PATHS`——该变量从你的 shell 环境继承；图片位于默认目录之外时，在启动 agent 前设置它。

## 其他 agent（Codex、zcode、mimocode）

本服务是纯 stdio MCP server，Claude 相关的只有 `CLAUDE_PROJECT_DIR`（缺省回退到 cwd）和插件文件。Codex 分支（zcode、mimocode）接受与 Claude Code 相同的 JSON 配置；Codex 本体使用 TOML 表：

```bash
node bin/local-vision.mjs --print-mcp-config --format codex > /tmp/local-vision.toml
```

把输出的 `[mcp_servers.local-vision]` 表追加到 `~/.codex/config.toml`（或项目 `.codex/config.toml`）。

## MCP 工具

`vision_analyze` 接受：

```json
{
  "path": "/absolute/path/to/screenshot.png",
  "question": "What UI error is visible?",
  "mode": "ui",
  "detail": "standard"
}
```

- `mode`：`ui`（截图、布局、视觉 bug）、`ocr`（精确转写可见文字）、`general`（其他）
- `detail`：`standard`（默认）或 `fast`（快速初扫）
- 结果字段：`answer`、`observations`、`visible_text`、`uncertainties`；失败时返回 `error_code` 且 `isError: true`

## 配置

所有配置都有默认值，通常只需 `VISION_ALLOWED_PATHS`。插件模式下同样生效（由 `.mcp.json` 转发）。

| 变量 | 默认值 | 作用 |
|---|---|---|
| `VISION_MODEL` | `qwen3-vl:4b` | Ollama 视觉模型 |
| `VISION_OLLAMA_HOST` | `http://127.0.0.1:11434` | Ollama 地址 |
| `VISION_ALLOWED_PATHS` | （空） | 额外的图片允许目录，以 `:` 分隔 |
| `VISION_TIMEOUT_MS` | `90000` | 两次尝试共用的总请求预算 |
| `VISION_MAX_BYTES` | `20971520` | 图片大小上限（20 MiB） |
| `VISION_MAX_OUTPUT_CHARS` | `12000` | 报告文本长度上限 |
| `VISION_KEEP_ALIVE` | `5m` | Ollama 模型保活时长 |

## 故障排查

| `error_code` | 含义 | 解决 |
|---|---|---|
| `MODEL_NOT_FOUND` | 模型未安装 | `ollama pull qwen3-vl:4b` |
| `OLLAMA_UNAVAILABLE` | Ollama 未运行 | 启动 Ollama（`ollama serve`） |
| `TIMEOUT` | 超过 `VISION_TIMEOUT_MS` 预算 | 调大 `VISION_TIMEOUT_MS` |
| `PATH_NOT_ALLOWED` | 图片在允许目录之外 | 设置 `VISION_ALLOWED_PATHS` |
| `FILE_TOO_LARGE` | 超过 `VISION_MAX_BYTES` | 压缩图片或调大限额 |
| `EMPTY_REPORT` | 模型未返回内容（`--smoke`） | 确认使用的是视觉模型 |

## 开发

```bash
npm test        # node:test 测试套件（不触网）
npm run doctor  # 检查 Ollama 可达性与模型安装
npm run smoke   # 真实端到端：生成测试 PNG → 询问 Ollama → 校验报告
```

`npm run smoke` 需要本地 Ollama 运行且装有配置的模型；只有整条链路正常时才以 0 退出。

## 调试日志

诊断信息只写 stderr（stdout 保持协议纯净）。用 `--debug` 或 `LOG_LEVEL=debug` 开启：

```bash
LOG_LEVEL=debug node bin/local-vision.mjs
```

每次 `vision_analyze` 调用都会记录耗时、模型、模式与 `ok`/`error_code`；启动时记录解析后的配置。服务不会缓存或记录图片字节。
