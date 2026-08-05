import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeVisionReport } from "../src/report.mjs";

const context = {
  model: "qwen3-vl:4b",
  sourcePath: "/tmp/screenshot.png",
  mode: "ui",
};

test("normalizes fenced JSON into a stable visual report envelope", () => {
  const report = normalizeVisionReport(
    "```json\n{" +
      '"answer":"A login form is visible.",' +
      '"observations":["The submit button is disabled."],' +
      '"visible_text":["Sign in"],' +
      '"uncertainties":[]' +
    "}\n```",
    context,
  );

  assert.deepEqual(report, {
    ok: true,
    model: "qwen3-vl:4b",
    source_path: "/tmp/screenshot.png",
    mode: "ui",
    answer: "A login form is visible.",
    observations: ["The submit button is disabled."],
    visible_text: ["Sign in"],
    uncertainties: [],
  });
});

test("keeps non-JSON model output as a readable answer", () => {
  const report = normalizeVisionReport("The terminal shows a TypeScript error.", context);

  assert.equal(report.ok, true);
  assert.equal(report.answer, "The terminal shows a TypeScript error.");
  assert.deepEqual(report.observations, []);
  assert.deepEqual(report.visible_text, []);
  assert.deepEqual(report.uncertainties, []);
});
