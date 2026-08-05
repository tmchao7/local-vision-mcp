function stripCodeFence(value) {
  const trimmed = String(value ?? "").trim();
  const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return match ? match[1].trim() : trimmed;
}

function asText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function capText(value, maxChars) {
  const text = asText(value);
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 1))}…`;
}

function asList(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 24);
}

function baseReport(context) {
  return {
    ok: true,
    model: context.model,
    source_path: context.sourcePath,
    mode: context.mode,
    answer: "",
    observations: [],
    visible_text: [],
    uncertainties: [],
  };
}

export function normalizeVisionReport(raw, context) {
  const report = baseReport(context);
  const maxChars = Number(context.maxOutputChars || 12_000);
  const text = stripCodeFence(raw);
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = null;
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    report.answer = capText(text || "The vision model returned an empty response.", maxChars);
    return report;
  }

  report.answer = capText(asText(parsed.answer || parsed.summary || parsed.report) || JSON.stringify(parsed), maxChars);
  report.observations = asList(parsed.observations).map((item) => capText(item, 1_000));
  report.visible_text = asList(parsed.visible_text || parsed.visibleText || parsed.text_seen).map((item) => capText(item, 1_000));
  report.uncertainties = asList(parsed.uncertainties || parsed.uncertain).map((item) => capText(item, 1_000));
  return report;
}

export function createVisionError(error, context) {
  const report = baseReport(context);
  report.ok = false;
  report.error_code = error?.code || "VISION_ERROR";
  report.answer = error?.message || "Vision analysis failed.";
  return report;
}

export function reportToText(report) {
  const lines = [report.answer];
  if (report.observations.length > 0) {
    lines.push("", "Observations:", ...report.observations.map((item) => `- ${item}`));
  }
  if (report.visible_text.length > 0) {
    lines.push("", "Visible text:", ...report.visible_text.map((item) => `- ${item}`));
  }
  if (report.uncertainties.length > 0) {
    lines.push("", "Uncertainties:", ...report.uncertainties.map((item) => `- ${item}`));
  }
  return lines.join("\n");
}
