export function isDebugEnabled(env = process.env, argv = process.argv.slice(1)) {
  const level = String(env.LOG_LEVEL ?? "").toLowerCase();
  return argv.includes("--debug") || level === "debug" || level === "trace" || level === "1";
}

export function createLogger({ debug = false, stream = process.stderr } = {}) {
  const format = (value) => (typeof value === "string" ? value : JSON.stringify(value));
  const write = (tag, args) => {
    const parts = args.filter((value) => value !== undefined && value !== null && value !== "");
    if (parts.length > 0) stream.write(`[local-vision] ${tag} ${parts.map(format).join(" ")}\n`);
  };
  return {
    debug(...args) {
      if (debug) write("debug", args);
    },
    info(...args) {
      if (debug) write("info", args);
    },
    error(...args) {
      if (debug) write("error", args);
    },
  };
}
