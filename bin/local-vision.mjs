#!/usr/bin/env node
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { readConfig } from "../src/config.mjs";
import { runDoctor } from "../src/doctor.mjs";
import { createLogger, isDebugEnabled } from "../src/log.mjs";
import { buildMcpServerConfig, formatMcpServerConfig, mcpConfigFormat } from "../src/mcp-config.mjs";
import { SERVER_NAME, createVisionServer } from "../src/server.mjs";
import { runSmoke } from "../src/smoke.mjs";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const config = readConfig();

if (process.argv.includes("--doctor")) {
  const result = await runDoctor({ config });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(result.ok ? 0 : 1);
}

if (process.argv.includes("--smoke")) {
  const result = await runSmoke({ config });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(result.ok ? 0 : 1);
}

if (process.argv.includes("--print-mcp-config")) {
  const { format, error } = mcpConfigFormat(process.argv.slice(2));
  if (error) {
    process.stderr.write(`${error}\n`);
    process.exit(2);
  }
  const descriptor = buildMcpServerConfig({
    serverName: SERVER_NAME,
    command: process.execPath,
    args: [join(packageRoot, "bin/local-vision.mjs")],
    config,
  });
  process.stdout.write(`${formatMcpServerConfig(descriptor, format)}\n`);
  process.exit(0);
}

const log = createLogger({ debug: isDebugEnabled() });
log.info(
  `startup model=${config.model} host=${config.ollamaHost} projectDir=${config.projectDir}`,
  `allowedPaths=${config.allowedPaths.length} maxBytes=${config.maxBytes} timeoutMs=${config.timeoutMs}`,
  `keepAlive=${config.keepAlive} maxOutputChars=${config.maxOutputChars}`,
);

const { server } = createVisionServer({ config, log });
const transport = new StdioServerTransport();

try {
  await server.connect(transport);
} catch (error) {
  process.stderr.write(`local-vision MCP failed: ${error.message}\n`);
  process.exit(1);
}
