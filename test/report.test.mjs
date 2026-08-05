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

test("keeps half-truncated JSON as a readable answer", () => {
  const raw = '{"answer":"A login form is visible.","observations":["The submit but';
  const report = normalizeVisionReport(raw, context);

  assert.equal(report.ok, true);
  assert.equal(report.answer, raw);
  assert.deepEqual(report.observations, []);
  assert.deepEqual(report.visible_text, []);
  assert.deepEqual(report.uncertainties, []);
});

test("recovers JSON truncated after a complete value by appending the closing brace", () => {
  const raw = '{"answer":"A login form is visible.","observations":["The submit button is disabled."],"visible_text":[],"uncertainties":[]';
  const report = normalizeVisionReport(raw, context);

  assert.equal(report.ok, true);
  assert.equal(report.answer, "A login form is visible.");
  assert.deepEqual(report.observations, ["The submit button is disabled."]);
  assert.deepEqual(report.uncertainties, []);
});

test("keeps an array-shaped model response as a readable answer", () => {
  const report = normalizeVisionReport('["alpha","beta"]', context);

  assert.equal(report.ok, true);
  assert.equal(report.answer, '["alpha","beta"]');
  assert.deepEqual(report.observations, []);
});

test("caps a single oversized list item at 1000 characters", () => {
  const longItem = "x".repeat(1500);
  const report = normalizeVisionReport(
    JSON.stringify({ answer: "ok", observations: [longItem] }),
    context,
  );

  assert.equal(report.observations.length, 1);
  assert.equal(report.observations[0].length, 1000);
  assert.match(report.observations[0], /…$/);
});

test("maps alias keys to the canonical report fields", () => {
  const report = normalizeVisionReport(
    JSON.stringify({
      summary: "Alias summary.",
      observations: ["obs"],
      visibleText: ["text"],
      uncertain: ["maybe"],
    }),
    context,
  );

  assert.equal(report.answer, "Alias summary.");
  assert.deepEqual(report.visible_text, ["text"]);
  assert.deepEqual(report.uncertainties, ["maybe"]);
});

test("treats fenced JSON with trailing prose as plain text", () => {
  const raw = '```\n{"answer":"A login form is visible."}\n``` trailing junk';
  const report = normalizeVisionReport(raw, context);

  assert.equal(report.ok, true);
  assert.equal(report.answer, raw);
});
