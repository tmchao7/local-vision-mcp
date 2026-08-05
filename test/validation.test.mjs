import assert from "node:assert/strict";
import { mkdtemp, mkdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { VisionInputError, validateImageInput } from "../src/validation.mjs";

test("resolves a relative image inside an allowed project directory", async () => {
  const root = await mkdtemp(join(tmpdir(), "local-vision-validation-"));
  try {
    await mkdir(join(root, "screens"));
    await writeFile(join(root, "screens", "error.png"), Buffer.from("png"));

    const result = await validateImageInput("screens/error.png", {
      projectDir: root,
      allowedPaths: [root],
      maxBytes: 1024,
    });

    assert.equal(result.path, await realpath(join(root, "screens", "error.png")));
    assert.equal(result.mediaType, "image/png");
    assert.equal(result.size, 3);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects an image outside the configured allowed paths", async () => {
  const root = await mkdtemp(join(tmpdir(), "local-vision-validation-"));
  const outside = await mkdtemp(join(tmpdir(), "local-vision-outside-"));
  try {
    await writeFile(join(outside, "secret.png"), Buffer.from("png"));

    await assert.rejects(
      validateImageInput(join(outside, "secret.png"), {
        projectDir: root,
        allowedPaths: [root],
        maxBytes: 1024,
      }),
      (error) => error instanceof VisionInputError && error.code === "PATH_NOT_ALLOWED",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test("rejects unsupported files and files larger than the configured limit", async () => {
  const root = await mkdtemp(join(tmpdir(), "local-vision-validation-"));
  try {
    await writeFile(join(root, "notes.txt"), Buffer.from("text"));
    await writeFile(join(root, "large.jpg"), Buffer.alloc(8));

    await assert.rejects(
      validateImageInput("notes.txt", { projectDir: root, allowedPaths: [root], maxBytes: 1024 }),
      (error) => error instanceof VisionInputError && error.code === "UNSUPPORTED_TYPE",
    );
    await assert.rejects(
      validateImageInput("large.jpg", { projectDir: root, allowedPaths: [root], maxBytes: 4 }),
      (error) => error instanceof VisionInputError && error.code === "FILE_TOO_LARGE",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
