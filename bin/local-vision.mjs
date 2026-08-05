#!/usr/bin/env node
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { readConfig } from "../src/config.mjs";
import { runDoctor } from "../src/doctor.mjs";
import { SERVER_NAME, createVisionServer } from "../src/server.mjs";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const config = readConfig();

if (process.argv.includes("--doctor")) {
  const result = await runDoctor({ config });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(result.ok ? 0 : 1);
}

if (process.argv.includes("--print-mcp-config")) {
  const serverConfig = {
    mcpServers: {
      [SERVER_NAME]: {
        command: process.execPath,
        args: [join(packageRoot, "bin/local-vision.mjs")],
        env: {
          VISION_MODEL: config.model,
          VISION_OLLAMA_HOST: config.ollamaHost,
        },
      },
    },
  };
  process.stdout.write(`${JSON.stringify(serverConfig, null, 2)}\n`);
  process.exit(0);
}

const { server } = createVisionServer({ config });
const transport = new StdioServerTransport();

try {
  await server.connect(transport);
} catch (error) {
  process.stderr.write(`local-vision MCP failed: ${error.message}\n`);
  process.exit(1);
}
