// VISION_ALLOWED_PATHS is intentionally omitted: config.allowedPaths is a resolved
// path list that cannot round-trip through resolve(projectDir, item) semantics, and
// an explicit empty value in a generated config would clobber the user's shell env.
export function configEnv(config) {
  return {
    VISION_MODEL: config.model,
    VISION_OLLAMA_HOST: config.ollamaHost,
    VISION_MAX_BYTES: String(config.maxBytes),
    VISION_TIMEOUT_MS: String(config.timeoutMs),
    VISION_KEEP_ALIVE: config.keepAlive,
    VISION_MAX_OUTPUT_CHARS: String(config.maxOutputChars),
  };
}

export function buildMcpServerConfig({ serverName, command, args, config }) {
  return { serverName, command, args, env: configEnv(config) };
}

function tomlQuote(value) {
  // JSON.stringify escapes (\", \\, \n, \uXXXX) are a valid subset of TOML basic strings,
  // and it never emits the TOML-forbidden \/.
  return JSON.stringify(value);
}

export function formatMcpServerConfig(descriptor, format) {
  if (format === "codex") {
    return [
      `[mcp_servers.${descriptor.serverName}]`,
      `command = ${tomlQuote(descriptor.command)}`,
      `args = [${descriptor.args.map(tomlQuote).join(", ")}]`,
      `env = { ${Object.entries(descriptor.env).map(([key, value]) => `${key} = ${tomlQuote(value)}`).join(", ")} }`,
      "enabled = true",
    ].join("\n");
  }
  return JSON.stringify({
    mcpServers: {
      [descriptor.serverName]: {
        command: descriptor.command,
        args: descriptor.args,
        env: descriptor.env,
      },
    },
  }, null, 2);
}

export function mcpConfigFormat(argv = []) {
  const index = argv.indexOf("--format");
  if (index === -1) return { format: "json" };
  const raw = argv[index + 1];
  const value = String(raw ?? "").toLowerCase();
  if (value === "json" || value === "generic") return { format: "json" };
  if (value === "codex") return { format: "codex" };
  return { error: `Unknown --format "${raw}". Supported formats: json, codex.` };
}
