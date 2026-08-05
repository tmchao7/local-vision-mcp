import assert from "node:assert/strict";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { readConfig } from "../src/config.mjs";

test("allows common local image directories by default", () => {
  const projectDir = "/tmp/local-vision-project";
  const config = readConfig({}, projectDir);

  for (const directory of ["Pictures", "Desktop", "Downloads"]) {
    assert.ok(config.allowedPaths.includes(resolve(homedir(), directory)), directory);
  }
  assert.ok(config.allowedPaths.includes(resolve(projectDir)));
});

test("keeps explicitly configured allowed paths", () => {
  const projectDir = "/tmp/local-vision-project";
  const config = readConfig({ VISION_ALLOWED_PATHS: join("/tmp", "screenshots") }, projectDir);

  assert.ok(config.allowedPaths.includes("/tmp/screenshots"));
});
