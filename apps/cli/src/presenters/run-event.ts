import type { RunDirectReport } from "../../../../packages/shared/src/types/run.js";

export function renderRunText(report: RunDirectReport): string {
  const lines = [
    `session: ${report.sessionId}`,
    `model: ${report.model}`,
    `agent: ${report.agentId}`,
    `runtime authority: ${report.runtimeAuthority}`,
    `final status: ${report.finalStatus}`,
  ];
  if (report.degradedReason) lines.push(`degraded reason: ${report.degradedReason}`);
  if (report.files.length > 0) lines.push(`files: ${report.files.map((file) => file.path).join(", ")}`);
  lines.push("", report.text);
  return lines.join("\n");
}

export function renderRunNdjson(report: RunDirectReport): string {
  return report.events.map((event) => JSON.stringify(event)).join("\n");
}
